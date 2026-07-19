# Agent expansion: token metering (A6), agent annotations (A1), admin config (A7), sigma-runs fix (A3)

Date: 2026-07-19 (session 67). Approved in brainstorming; scope = roadmap Milestone 8 items
A6, A1, A7, with A3 as a ride-along fix. A8 (external MCP toolsets) is explicitly out of
scope and keeps its own future design round.

Delivery order (one branch, separate commits, small → large):
**A3 → A6 → A1 → A7.**

---

## A3 — `list_sigma_runs` case-wide limit (ride-along fix)

`PostgresStore.list_sigma_runs` applies `limit=50` case-wide before
`agent/tools.py::list_sigma_runs` filters to the current timeline, so runs on other
timelines can starve the list.

Fix: add an optional `timeline_id` parameter to `PostgresStore.list_sigma_runs` and push
the filter into the query; drop the Python-side post-filter in `agent/tools.py`. The HTTP
router keeps its current behavior (pass `timeline_id=None`). No migration.

Tests: store-level filter test; agent-tool test showing a timeline's runs are returned even
when >50 runs exist on a sibling timeline.

## A6 — Token-usage metering

**Capture.** pydantic-ai exposes usage on the run result (`result.usage()`), with request
(prompt) and response (completion) token counts. `agent/runtime.py::stream_turn` reads it
after the run completes and stamps it onto the assistant message row it already persists.

**Storage.** Migration 0009 adds two nullable integer columns to `agent_messages`:
`prompt_tokens`, `completion_tokens`. Null means "not measured" — pre-metering rows, or an
endpoint that reported no usage (some ollama/llama.cpp deployments omit it). We never
estimate: measured or null, per the forensic-honesty stance. No denormalized totals;
conversation totals are a SUM at read time.

**Surface.**
- Message list API response gains the two fields per assistant message (null-safe).
- Frontend AgentPanel: a small muted per-turn chip under each assistant message
  (e.g. "12.4k in / 890 out"), and a running conversation total in the panel header.
  Chip and total hidden when values are null.
- No new endpoints.

Tests: FunctionModel-stubbed run produces stamped counts; endpoint-reports-no-usage path
stores null; message list API carries the fields; frontend rendering covered by the existing
agent panel test file if present, otherwise API-shape test only.

## A1 — Agent annotations (`origin: agentic-analysis`)

Propose → confirm → write. The agent proposes; only an explicit analyst action writes.

**New tool: `propose_annotation`** (sibling of `propose_finding`, same closure pattern in
`agent/tools.py`):

- Signature: `propose_annotation(event_ids: list[str], tag: str | None, comment: str | None,
  rationale: str)`. At least one of `tag`/`comment` required. `event_ids` capped at 500;
  over-cap is a tool error instructing the model to narrow. Explicit event IDs only — no
  FilterSpec targeting. An annotation is a deliberate, focused act; IDs make the confirmed
  write exactly what the analyst saw.
- The tool validates the IDs resolve within the bound case/timeline scope, records the
  proposal (status `proposed`) on the conversation, and returns "proposal recorded, awaiting
  analyst confirmation" to the model. **No write occurs inside the agent loop.**
- **Excluded from the external `/mcp` server build.** Confirmation requires the in-app chat
  UI; `build_tool_server` gains a flag (or separate assembly) so the HTTP transport never
  registers the tool. Decision (a) from brainstorming: write-adjacent tools stay in-app in v1.

**Proposal persistence.** Migration 0010:
- Proposals get a stable identity + lifecycle: id, conversation id, message id, payload
  (event_ids, tag, comment, rationale), status `proposed | confirmed | rejected`, decided_by
  (user id), decided_at. Stored as their own table (`agent_proposals`) rather than JSON inside
  `agent_messages`, so status transitions are queryable and idempotent.
- `Annotation.origin` gains the value `agentic-analysis` alongside `user`/`system` (adjust
  whatever check constraint/enum exists; SQLite-portable).

**Confirm/reject endpoints** (session-cookie auth, normal case RBAC — the analyst executes
the write, not the agent):
- `POST /api/cases/{case_id}/agent/conversations/{conv_id}/proposals/{proposal_id}/confirm`
- `POST .../reject`
- Confirm writes annotations through the existing annotation path with
  `origin="agentic-analysis"`. If some proposed event IDs no longer resolve, the rest are
  written and the response reports the skipped count. Confirm/reject are idempotent: acting
  on a non-`proposed` proposal returns 409 with the current status.
- Conversations are per-user; only the conversation owner can confirm/reject (consistent
  with existing conversation privacy).

**Audit.** Confirm: `action="agent.annotation_confirm"` with analyst user id, conversation
id, proposal id, event count, tag/comment. Reject: `action="agent.annotation_reject"` —
the decision trail is part of the record either way.

**Frontend.** AgentPanel renders a proposal card (visual sibling of the finding card):
tag/comment, event count, rationale, Confirm/Reject buttons. After confirm the card shows
the written state and offers an "open in Explorer" link applying an `event_ids` filter.
Rejected cards render collapsed/struck.

Tests: tool validation (cap, scope, tag-or-comment), proposal lifecycle
(confirm/reject/double-act 409), partial-miss write, RBAC + owner-only, audit rows, `/mcp`
server does not expose the tool, frontend card mapping.

**Docs:** `AGENT.md` — "Read-only v1" invariant rewritten to describe the propose/confirm
write path; tool count updated.

## A7 — Agent config in the admin interface

**Storage.** Migration 0011: singleton table `agent_settings` (pattern:
`enricher_global_configs`), one row, nullable columns: `model`, `provider`, `api_base_url`,
`api_key`, `user_agent`, `extra_headers` (JSON), `max_turns`, `reasoning_effort`. API key
stored as Postgres plaintext like other secrets today; write-only through the API.

**Precedence — env always wins, per field.** A resolver produces the effective agent config:
for each field, `VESTIGO_AGENT_*` env value if set, else DB value if set, else default.
Field-level, not all-or-nothing (operator can pin the base URL while admins pick the model).
This preserves the explicit-operator stance on network endpoints.

**API** (`admin.py`, admin RBAC like the enricher config):
- `GET /api/admin/agent-settings` — effective config plus per-field source
  (`env | db | default`); `api_key` never returned, only `api_key_set: bool`. Env-pinned
  fields include the env var name so the UI can label them.
- `PUT /api/admin/agent-settings` — partial update; empty string clears a DB value; writes
  to env-pinned fields are accepted into the DB but remain shadowed (UI disables those
  inputs anyway). Audited as `action="admin.agent_settings_update"` with the list of changed
  field *names* only (values could leak the key).
- Any successful PUT invalidates the availability-probe cache (`agent/availability.py`) so
  the next `/api/health` re-probes with the new config.

**Reasoning effort** — new concept, closed enum `off | low | medium | high | max`
(default `off` = today's behavior). Translation lives in `runtime.build_model`:

| provider | translation |
|---|---|
| OpenAI protocol | pass string verbatim as `reasoning_effort`; `off` → omit the field |
| Anthropic protocol (generic) | `thinking` budget: off = none, low = 2k, medium = 8k, high = 24k, max = 32k tokens |
| Kimi `/coding` (Anthropic protocol, already special-cased) | send Kimi's effort string: `low`→`low`, `medium`→`high` (Kimi's own mapping), `high`→`high`, `max`→`max`, `off`→`none` |

The existing Kimi carve-out ("never send the `thinking` request parameter") predates K3 and
is revised: K3/K2.7 route to K2.6 when thinking is off, and K3 selects depth via effort
levels, so the endpoint must receive the effort signal.

**Verification gate before implementing the Kimi branch:** the pasted Kimi docs give the
effort *mapping* but not the *wire field* their Anthropic-protocol endpoint reads
(`reasoning_effort` body field vs. a `thinking` variant). Verify against the Kimi CLI /
hermes-agent source first (per the standing verify-external-API-claims practice). The
OpenAI and generic-Anthropic branches are not blocked on this.

Context window note: K3 advertises up to 1M context; Vestigo's runtime sets no client-side
context-window field, so nothing to change — documented in `AGENT.md` only.

**Frontend.** New section in the existing admin page: plain form, per-field
"pinned by environment (VESTIGO_AGENT_…)" badges with disabled inputs, masked key input
("set"/"not set" indicator), reasoning-effort select, "test connection" button that forces
a probe and reports the result.

Tests: precedence matrix (env vs DB vs default, per field), key masking (GET never returns
it), probe-cache invalidation on PUT, effort translation per provider branch, audit row on
update, admin-RBAC gating.

**Docs:** `AGENT.md` config section gains the DB-settings layer + precedence table and the
revised Kimi effort behavior; `ROADMAP.md` items removed as they land.

## Out of scope

- A8 external MCP toolsets (own design round; OPSEC gate + forensic capture requirements
  recorded in `ROADMAP.md`).
- A4 stays a watch item (no action; MCP SDK currently rejects JSON-RPC batching).
- Annotation writes beyond tag/comment (dispositions, saved views) — deliberate v1 cut.
- Estimated token counts when the endpoint reports none — measured or null, never faked.
