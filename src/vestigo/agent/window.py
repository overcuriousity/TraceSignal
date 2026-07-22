"""Sliding context window: keep every model request inside the context budget.

Applied before *every* model request (mid-turn included) via pydantic-ai's
``ProcessHistory`` capability, so a single broad turn that piles up tool
results — the case that actually overflowed a 64k model (2026-07-21) — shrinks
as it grows instead of dying on the provider's 400. Two passes, cheapest first:

1. **Elide** — oldest-first, each ``ToolReturnPart``'s content is replaced by a
   small stub until the estimated prompt fits the budget. Message structure is
   untouched, so tool_call/tool_result pairing and role alternation stay valid
   on every provider protocol. The stub names the recovery path (re-run the
   tool, ``get_event``) so the model can adapt rather than guess.
2. **Drop turns** — if elision is not enough, whole oldest user turns are
   replaced by one marker pair. Splitting only at user-prompt boundaries keeps
   tool exchanges intact (same invariant the retired compaction held).

Never touched: the first user request (it carries the case/timeline context),
tool returns of the most recent request (what the model is about to reason
over), the last user turn, and all assistant prose (the findings narrative —
small, high value).

**Determinism is the design constraint**, inherited from ``agent/fidelity.py``:
:func:`apply_window` is a pure function of (messages, budget), so replaying a
conversation under the same configuration elides the same bytes. The stored
history blob stays complete — the window applies at send time only.

See ``docs/superpowers/specs/2026-07-22-agent-sliding-window-design.md``.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, replace
from typing import Any

from pydantic_ai.messages import (
    ModelMessage,
    ModelMessagesTypeAdapter,
    ModelRequest,
    ModelResponse,
    TextPart,
    ToolReturnPart,
    UserPromptPart,
)

logger = logging.getLogger(__name__)

__all__ = [
    "ELISION_NOTE",
    "TURN_DROP_MARKER",
    "WindowStats",
    "apply_window",
    "budget_for",
    "estimate_tokens",
    "make_window_processor",
]

#: What replaces an elided tool result. Visible to the model in the replayed
#: history — transparency is the point: the model can re-run the tool with
#: narrower filters instead of reasoning over a silent gap.
ELISION_NOTE = (
    "Result elided to fit the context window — re-run the tool with narrower "
    "filters or use get_event to recover specifics."
)

#: Prefix of the stub user message standing in for dropped turns — also what an
#: analyst sees when inspecting raw_history in exports.
TURN_DROP_MARKER = "[Older turns dropped to fit the context window]"

#: Share of the context window the prompt may use; the rest is headroom for the
#: completion and the estimate's error (chars/4 is a heuristic, not a tokenizer).
MARGIN = 0.8


@dataclass
class WindowStats:
    """What the window did across one turn's requests (maxima, see processor)."""

    budget: int = 0
    results_elided: int = 0
    turns_dropped: int = 0
    estimated_before: int = 0
    estimated_after: int = 0

    @property
    def reduced(self) -> bool:
        return self.results_elided > 0 or self.turns_dropped > 0


def _serialized_size(value: Any) -> int:
    return len(json.dumps(value, default=str))


def estimate_tokens(messages: list[ModelMessage]) -> int:
    """Rough prompt size of a history, in tokens (chars/4 over the JSON dump)."""
    return len(ModelMessagesTypeAdapter.dump_json(messages)) // 4


def budget_for(context_window: int, system_prompt: str) -> int:
    """Token budget for the message history, from the configured window.

    ``MARGIN`` leaves completion headroom; the system prompt rides outside the
    message list, so its estimated share is subtracted here once.
    """
    return int(context_window * MARGIN) - len(system_prompt) // 4


def _stub() -> dict[str, Any]:
    return {"elided": True, "note": ELISION_NOTE}


def _is_stub(content: Any) -> bool:
    return isinstance(content, dict) and content.get("elided") is True


def _user_turn_boundaries(messages: list[ModelMessage]) -> list[int]:
    """Indices of requests that start a user turn (contain a UserPromptPart).

    Requests that only carry tool returns are *not* boundaries — splitting
    there would orphan a tool_use from its tool_result on replay.
    """
    return [
        i
        for i, message in enumerate(messages)
        if isinstance(message, ModelRequest)
        and any(isinstance(part, UserPromptPart) for part in message.parts)
    ]


def _last_request_index(messages: list[ModelMessage]) -> int:
    for i in range(len(messages) - 1, -1, -1):
        if isinstance(messages[i], ModelRequest):
            return i
    return -1


def _elide(messages: list[ModelMessage], budget: int, running: int) -> tuple[int, int]:
    """Pass 1: stub out tool-return contents oldest-first, in place.

    ``messages`` is the caller's private copy. Returns (results_elided,
    running estimate). The most recent request's returns are protected — they
    are what the model is about to reason over.
    """
    protected = _last_request_index(messages)
    stub_cost = _serialized_size(_stub()) // 4
    elided = 0
    for i, message in enumerate(messages):
        if running <= budget:
            break
        if i == protected or not isinstance(message, ModelRequest):
            continue
        parts = list(message.parts)
        changed = False
        for j, part in enumerate(parts):
            if running <= budget:
                break
            if not isinstance(part, ToolReturnPart) or _is_stub(part.content):
                continue
            saving = _serialized_size(part.content) // 4 - stub_cost
            parts[j] = replace(part, content=_stub())
            changed = True
            elided += 1
            running -= max(saving, 0)
        if changed:
            messages[i] = replace(message, parts=parts)
    return elided, running


def _drop_turns(messages: list[ModelMessage], budget: int, running: int) -> tuple[int, int]:
    """Pass 2: replace the oldest droppable turns with one marker pair.

    The first turn (case context) and the last turn (the question being
    answered) are never dropped. Dropping is contiguous from the second turn,
    so one stub pair stands for the whole removed span — cheaper than a marker
    per turn, and just as explicit. Mutates and returns ``messages``'s content
    via slice assignment on the caller's private copy.
    """
    boundaries = _user_turn_boundaries(messages)
    # Droppable spans: turn k covers boundaries[k]..boundaries[k+1]; the first
    # and last turns are protected, so k ranges over 1..len-2.
    dropped = 0
    end = boundaries[1] if len(boundaries) > 2 else None
    for k in range(1, len(boundaries) - 1):
        if running <= budget:
            break
        span_end = boundaries[k + 1]
        running -= sum(estimate_tokens([m]) for m in messages[boundaries[k] : span_end])
        end = span_end
        dropped += 1
    if not dropped:
        return 0, running
    marker: list[ModelMessage] = [
        ModelRequest(
            parts=[
                UserPromptPart(
                    content=(
                        f"{TURN_DROP_MARKER} — {dropped} earlier turn(s) removed. Earlier "
                        "findings persist as annotations and proposals; use list_annotations "
                        "or re-ask if something is missing."
                    )
                )
            ]
        ),
        ModelResponse(
            parts=[TextPart(content="Understood. Continuing with the remaining context.")]
        ),
    ]
    messages[boundaries[1] : end] = marker
    return dropped, running + estimate_tokens(marker)


def apply_window(
    messages: list[ModelMessage], budget: int
) -> tuple[list[ModelMessage], WindowStats]:
    """Fit ``messages`` under ``budget`` tokens; pure — the input is not mutated.

    Best effort: a history that cannot fit even after both passes is returned
    as reduced as the invariants allow, and the router's overflow handling
    remains the backstop.
    """
    before = estimate_tokens(messages)
    stats = WindowStats(budget=budget, estimated_before=before, estimated_after=before)
    if before <= budget:
        return list(messages), stats
    out = list(messages)
    stats.results_elided, running = _elide(out, budget, before)
    if running > budget:
        stats.turns_dropped, running = _drop_turns(out, budget, running)
    stats.estimated_after = estimate_tokens(out)
    if stats.reduced:
        logger.info(
            "Context window applied: %d results elided, %d turns dropped (est. %d -> %d, budget %d)",
            stats.results_elided,
            stats.turns_dropped,
            stats.estimated_before,
            stats.estimated_after,
            budget,
        )
    return out, stats


def make_window_processor(budget: int, stats: WindowStats):
    """History processor for ``ProcessHistory``, accumulating turn maxima.

    The processor runs once per model request; ``stats`` keeps the largest
    reduction seen so the router can persist one honest row per turn rather
    than one per request.
    """

    def process(messages: list[ModelMessage]) -> list[ModelMessage]:
        out, request_stats = apply_window(messages, budget)
        stats.budget = budget
        stats.results_elided = max(stats.results_elided, request_stats.results_elided)
        stats.turns_dropped = max(stats.turns_dropped, request_stats.turns_dropped)
        stats.estimated_before = max(stats.estimated_before, request_stats.estimated_before)
        stats.estimated_after = max(stats.estimated_after, request_stats.estimated_after)
        return out

    return process
