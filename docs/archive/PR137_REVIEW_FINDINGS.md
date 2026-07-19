# PR137 review findings — AI investigation agent (2026-07-19)

Full finding set from the pre-merge review of PR #137 (`feat/ai-agent`, 67 files,
+12.6k). All fixable items were fixed on the branch in the same session; the rest are
triaged into `ROADMAP.md` Milestone 8. Overall assessment: design invariants (scope
safety, forensic record, invisible-unless-configured, propose→confirm writes) held;
no blocking issues.

## Risks — fixed

1. **httpx client leak per turn** — `runtime.py::build_model` opened an
   `httpx.AsyncClient` per turn and never closed it (FD/connection-pool leak on every
   message). Fixed: `stream_turn` owns the client and closes it in a `finally`;
   `build_model` takes it as a parameter.
2. **Concurrent-turn history race** — two simultaneous `send_message` streams on one
   conversation both read `conversation.history` and both wrote `history + own
   new_messages`; the last writer silently dropped the other turn's messages from the
   replayable record. Fixed: in-memory `_active_turns` reservation, second POST → 409
   (single-process premise, same as JobStore).
3. **`/mcp` audit vs. JSON-RPC batches** — `_audit_tool_call` only parsed a single JSON
   object; a batched `tools/call` array would skip the audit row. The SDK transport
   rejects batches (removed in the 2025-06-18 MCP spec), so this was latent (was
   roadmap item A4). Fixed anyway (defense in depth): arrays now audit one row per
   `tools/call` member; A4 deleted.
4. **`/mcp` unbounded body buffering** — the endpoint buffered the whole request body
   in memory with no cap (post-auth DoS vector). Fixed: 10 MiB cap → 413.
5. **Confirm-before-write proposal gap** — `confirm_proposal` flips the status to
   `confirmed` *before* writing annotations; a crash in between leaves a confirmed
   proposal with zero annotations and no retry path (redecide 409s). **Not fixed** —
   already triaged as a deliberate single-process tradeoff (`ROADMAP.md` Milestone 8
   "Confirm-proposal crash-gap"); the atomic decide is the 409-idempotency backbone.

## Bug — fixed

6. **Orphaned proposals** — `delete_agent_conversation` deleted messages but not
   `agent_proposals` rows. Fixed: cascade delete in the same transaction.

## Nits — fixed

7. **Negative limit/offset in agent tools** — model-supplied paging passed through to
   SQL (`LIMIT -5` → ClickHouse error). Fixed: clamped in `_build_query` and per tool.
8. **Bearer header to every anthropic endpoint** — the probe duplicated the API key
   into `Authorization: Bearer` for *all* anthropic-protocol endpoints, not just Kimi's
   `/coding` (which needs it). Fixed: gated on `is_kimi_coding_endpoint` (helper moved
   to `agent/config.py`).
9. **`/api/health` blocking on the probe** — up to 5 s per TTL expiry when the LLM
   endpoint hangs. Fixed: stale-while-revalidate (stale value served immediately,
   background task re-probes; cold cache and fingerprint changes still probe
   synchronously).
10. **Unhandled create-conversation failure** — `AgentPanel.send()` awaited
    `createConversation` outside the try → unhandled rejection, no UI feedback. Fixed:
    moved inside; failure renders an error item and restores the input.
11. **Transcript flash on turn end** — live stream state was cleared before the
    persisted-conversation refetch resolved. Fixed: refetch awaited first.
12. **O(n²) stream re-parse** — every SSE delta re-derived the whole chat item list
    from an ever-growing event array. Fixed: incremental `foldStreamEvent` reducer.
13. **Swallowed non-409 proposal errors** — `ProposalCard` rethrew from `onError`
    (vanishes as an unhandled rejection). Fixed: error toast; 409 stays silent.

## Security questions — triaged to ROADMAP (Milestone 8)

14. **LLM API key plaintext at rest** (`agent_settings.api_key`, migration 0011) →
    roadmap item A10 (envelope encryption / secret-by-env-only; env-pinning already
    keeps the key out of the DB).
15. **Full user directory to any signed-in user** (`GET /api/auth/users`) → roadmap
    item A11 (config flag / co-case scoping if the deployment model outgrows small
    teams).
