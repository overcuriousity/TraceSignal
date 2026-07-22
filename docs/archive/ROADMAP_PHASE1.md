# TraceSignal Roadmap

This document tracks the agreed scope for the TraceSignal API and UI.

> **Current model:** Case / Source / Timeline / Artifact.
> See [`docs/MODEL_REFINEMENT.md`](../MODEL_REFINEMENT.md) for the design rationale
> (implementation complete). See [`docs/PROGRESS.md`](../PROGRESS.md) for the overall
> completion snapshot.

## Out of scope

The following Timesketch features are **not** planned for this phase:

- Stories
- Scenarios / DFIQ
- Graph view
- Analyzers
- Sigma rules
- LLM integration
- Threat intel

## In scope — all shipped

### 1. Source management ✅

A **Source** is one uploaded file — the atomic unit of forensic provenance.

- ✅ **Upload & ingest** — `POST /api/cases/{case_id}/sources` parses CSV/JSONL and writes
  events to ClickHouse without computing embeddings.
- ✅ **Provenance** — each Source stores `file_hash` (SHA-256), `filename`, `size_bytes`,
  `parser`, and `event_count`.
- ✅ **Content-addressed retention** — original files are retained under
  `data/sources/{hash[:2]}/{hash}` and can be re-downloaded via
  `GET /api/cases/{case_id}/sources/{source_id}/download`.
- ✅ **Delete source** — `DELETE /api/cases/{case_id}/sources/{source_id}` removes the
  Postgres row, ClickHouse events, and Qdrant vectors.

### 2. Timeline grouping ✅

A **Timeline** is a named grouping of Sources — the merged, correlated chronological view.

- ✅ **Default timeline** — every case has an implicit "All sources" timeline that is
  lazily populated as Sources upload.
- ✅ **Custom timelines** — `POST /api/cases/{case_id}/timelines` creates a named grouping;
  `POST /api/cases/{case_id}/timelines/{timeline_id}/sources/{source_id}` adds a Source.
- ✅ **Delete timeline** — `DELETE /api/cases/{case_id}/timelines/{timeline_id}` removes the
  grouping without deleting its Sources.

### 3. Explore view ✅

The main investigation screen is the merged timeline over a Timeline's Sources, built in
React 19 + Vite (`frontend/src/components/explorer/`):

- ✅ **Event grid** — virtualized table, resizable/pickable columns, comfortable/compact
  density toggle, light/dark theme toggle.
- ✅ **Event details inline panel** — single-row expand showing message, timestamp,
  `timestamp_desc`, `artifact`, `artifact_long`, `display_name`, `source_id`, tags, and all
  attributes.
- ✅ **Tag / comment annotations** — multi-select bulk apply; `Annotation` model scoped by
  `source_id`; per-event `GET/POST/DELETE` plus bulk `GET` for grid chips. Clickable
  include/exclude tag facet panel (`TagFacetPanel.tsx`) replaced the original free-text tag
  filter.
- ✅ **Saved views** — `View` model; `GET/POST/DELETE /api/cases/{case_id}/views`;
  `SaveViewDialog.tsx` in the UI.
- ✅ **Export CSV / JSONL** — `POST /api/cases/{case_id}/timelines/{timeline_id}/export`
  streams all matching events in batches, honoring filters; CSV includes forensic columns
  (`source_id`, `artifact`, `artifact_long`, `content_hash`, `file_hash`).
- ✅ **Time histogram** — `GET .../histogram` returns bucket counts by time, honoring the
  same filters as the events list; rendered with anomaly overlay markers.
- ✅ **Bidirectional keyset pagination** with jump-to-time.

### 4. Real column filtering ✅

`/events` supports `q`, `artifact`, `source_id`, `tag`, `exclude_tag`, `start`, `end`, plus
arbitrary field equality/exclusion filters via `filters` and `exclusions` JSON query params.
Tag filtering is pushed down into the ClickHouse `WHERE` clause (`hasAny(tags, ...)`) via
`TagFilter`/`add_tag_filter()` in `db/queries.py` rather than resolved client-side.

### 5. Anomaly & similarity panel ✅ — statistical engine

The original MVP scope described a purely embedding-distance anomaly panel. That was replaced
by a two-detector statistical engine run directly against ClickHouse (`db/anomaly_stats.py`,
inspired by `logdata-anomaly-miner`'s value/frequency detectors), alongside the still-present
Qdrant-backed similarity/semantic search:

- ✅ **`value_novelty` detector** — rare/first-seen field values, self-baseline and temporal
  (`baseline_end`-split) modes.
- ✅ **`frequency` detector** — z-score spikes/silences over time buckets, same two modes.
- ✅ **Persisted detector runs** — `DetectorRun` Postgres model + `GET
  /cases/{case_id}/detector-runs/{run_id}`, so a run's result set survives instead of being
  re-derived from URL-encoded event-ID lists.
- ✅ **Cross-detector suppression, pinned annotations, tag-aware field recommender.**
- ✅ `GET /api/cases/{case_id}/timelines/{timeline_id}/events/{event_id}/similar`
  (Qdrant distance-to-centroid / analyst-defined normal-baseline).
- ✅ Free-text semantic search, case-scoped similarity search.
- Honest "triage, not threat detection" framing throughout the UI (`MethodologyPanel.tsx`).

### 6. Case management ✅

- ✅ **Delete case** — `DELETE /api/cases/{case_id}` cascades to Sources, Timelines,
  ClickHouse events, Qdrant collections, and (as of the PR #4 follow-up pass) orphaned
  `View`/`Annotation` rows that the original cascade missed.

### 7. Embeddings per Source ✅

- ✅ **Generate vectors** — `POST /api/cases/{case_id}/sources/{source_id}/embed` starts a
  background job that reads the Source's events from ClickHouse, embeds them, and writes
  vectors to Qdrant.
- ✅ **Config isolation** — Qdrant collection names embed the embedding-config hash so
  incompatible models never mix.
- ✅ **Per-artifact field selection** — Sources can store an `embedding_config` that
  controls which fields of which artifacts are embedded; content-aware field recommender in
  the embed wizard.
- ✅ **Remote embedding option** — OpenAI-compatible remote embedding endpoint as an
  alternative to local sentence-transformers inference.

### 8. Authentication, RBAC, teams, audit trail, live collaboration ✅

- ✅ **Session-cookie auth** for local users, with a seeded one-time bootstrap admin
  (`TS_ADMIN_PASSWORD`) whose forced password rotation is enforced centrally in
  `AuthAuditMiddleware` for every mutating `/api/*` request.
- ✅ **Optional OIDC SSO** (`TS_OIDC_ENABLED`), gated at runtime via `/api/health`'s
  `oidc_enabled` flag rather than a build-time frontend env var.
- ✅ **Teams** with member/manager roles; **case-RBAC** dependency layer
  (`api/deps.py::resolve_case_access`) wired into every case-scoped endpoint.
- ✅ **Append-only audit trail** — ASGI middleware records mutating `/api/*` requests plus
  semantic per-action rows from auth/admin handlers; self-service (`/me/audit`) and
  admin-global (`/admin/audit`) query endpoints, CSV/JSON export.
- ✅ **SSE live-collaboration stream** — per-case invalidation events, re-validated against
  session/access on every keepalive tick (not just at connect).
- Full security review completed and all findings resolved — see
  `docs/archive/PR7_REVIEW_FINDINGS.md`.

## Remaining work before MVP is closed

- **Offline-mode enforcement** — `allow_online` (`core/config.py`) is a config flag that is
  defined but never checked at any call site. Airgapped-by-default is a stated hard
  requirement (`CLAUDE.md` §"Working conventions") that the code does not yet honor — a
  network call to HuggingFace or a remote embedding endpoint currently succeeds regardless of
  the flag. (OIDC SSO is a deliberate, documented exception to this — see `TECH_STACK.md` §6.)

## Explicitly deferred (not blocking MVP)

- **GPU acceleration (ROCm/CUDA)** — mentioned in `TECH_STACK.md` as a target but no
  GPU-specific code exists yet; CPU inference is the only path today. Revisit once ingestion
  throughput on CPU becomes a real bottleneck for a specific deployment.

## Notes

- All backend endpoints follow the FastAPI router pattern in
  `src/tracesignal/api/routers/` (`cases.py`, `events.py`, `jobs.py`).
- The backend is API-first; the frontend consumes the documented REST contract
  (`/api/docs`).
- For historical PR-review detail, see `docs/archive/PR4_REVIEW_FINDINGS.md` (moved out of
  the repo root since every item is marked resolved) and git history around commits `0a3e934`
  and `9f331a3`. The findings doc's own resolution claims are pending an independent
  re-verification pass before being treated as final.
