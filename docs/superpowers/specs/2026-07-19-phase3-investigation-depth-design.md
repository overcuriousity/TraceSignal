# Phase 3 — Investigation Depth (phase plan)

Date: 2026-07-19. Status: approved (brainstorm session, user-confirmed).

## Decision

Phase 3 centers on **analyst depth**: deepen the post-mortem investigation workflow for
the current user rather than expanding scope (M7 examination) or changing deployment
character (M6 streaming). The AI agent stays an **analysis companion** — agent-authored
stories are explicitly deferred to a later phase.

## Contents and ordering

### Step 0 — Consolidation preamble (small, do first)

1. **Merge `feat/ai-agent`** — PR137 findings already fixed on the branch.
2. **A10 — LLM API key at rest.** Decision: no envelope encryption (key-management
   theater without an external KMS). Ship a secret-by-env-only mode (e.g.
   `VESTIGO_AGENT_SECRET_MODE=env-only`) that refuses DB storage of the key, and
   document env-pinning (`VESTIGO_AGENT_API_KEY`) as the secure deployment path.
3. **CONCEPT.md refresh.** Drop stale §7 "out of scope" exclusions that are now roadmap
   milestones (streaming, correlation rules, story builder), fix §6.2 Qdrant collection
   naming (per case + embedding-config hash), reframe the doc from "MVP" language to the
   current product.

### Step 1 — W6 template clustering

First real feature: independent of the other two, backend-heavy, no design entanglement —
and its output (template IDs on events) becomes a facet/filter Steps 2–3 can consume.

- ClickHouse-side normalization pass first (mask digits/hex/UUID, group by normalized
  message); evaluate Drain3 (offline, pure Python) only if that proves too coarse — as
  the roadmap entry already specifies.
- UI: template browser + "mute template" disposition, reusing the `routine` collapse
  machinery shipped with `sequence_motif` (`collapse_routine`, materialized occurrences).

### Step 2 — A9 viz parity (agent charting)

Own design round before implementation (as the roadmap entry demands):

- Shared chart-spec schema backend↔frontend.
- Read tools wrapping existing viz queries (`field_timeseries`, `time_punchcard`,
  `field_pivot`, `field_scatter`, `compare_layers`) with per-tool row/bucket budgets.
- `propose_chart` tool: backend validates by executing the query, panel renders a live
  chart card with "Open in Visualize" and "Save" (analyst executes the write).
- Sandbox+apply invariant unchanged: the agent never mutates the analyst's view or
  writes anything itself.

Ordered before Stories so the chart-spec design is exercised once before Stories embeds it.

### Step 3 — W7 Stories (human-first)

Own design round. Shape agreed at phase level:

- Postgres model: `Story` per case, ordered blocks of kind
  `markdown | view-ref | chart-ref | event-ref`.
- Embeds are live queries in the editor, with **point-in-time snapshot on export** — the
  key design tension for the design round: a forensic report must stay reproducible even
  as the data view changes.
- RBAC via existing case roles; audit as usual.
- Agent authorship out of scope, but the block model includes room for an `origin` field
  so agent-drafted blocks slot in later without migration pain.

## Parked (deliberate)

- **D10 correlation rules** — next phase; W6 template IDs are a natural input alongside
  `sequence_motif` n-grams.
- **M6 streaming** and **M7 examination** — parked. Standing rule: when either resumes,
  the S1 stream-source model and the E1 artifact/vocabulary model are designed **jointly**
  in one `MODEL_REFINEMENT.md` round, so the data model migrates once, not twice.

## Alternatives considered

- **A9-first ordering** — rejected: blocks on a design round while W6 could already ship value.
- **Stories-first ordering** — rejected: biggest unknowns; better after A9's smaller design
  round exercises the chart-spec Stories will embed.
- **Stories with agent authorship from day one** — rejected by user: agent remains an
  analysis companion this phase.
- **Envelope encryption for A10** — rejected: without an external KMS the wrapping key
  lives next to the data; env-only mode is honest and cheap.
