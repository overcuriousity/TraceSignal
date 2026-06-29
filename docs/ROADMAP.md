# TraceVector Roadmap

This document tracks the agreed scope for the TraceVector API and UI.

> **Current model:** Case / Source / Timeline / Artifact.
> See [`docs/MODEL_REFINEMENT.md`](./MODEL_REFINEMENT.md) for the design rationale and
> implementation status. The items below are scoped to the **current** (post-refactor) model.

## Out of scope

The following Timesketch features are **not** planned for this phase:

- Stories
- Scenarios / DFIQ
- Graph view
- Analyzers
- Sigma rules
- LLM integration
- Threat intel

## In scope

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

### 3. Richer Explore view ✅ (mostly done)

The main investigation screen is the merged timeline over a Timeline's Sources:

- ✅ **Event details inline panel** — single-row expand showing message, timestamp,
  `timestamp_desc`, `artifact`, `artifact_long`, `display_name`, `source_id`, tags, and all
  attributes.
- ✅ **Tag / comment annotations**
  - Multi-select events.
  - "Tag" and "Comment" actions apply to all selected events.
  - Backend: `Annotation` model scoped by `source_id`; endpoints for per-event
    `GET/POST/DELETE` plus a bulk `GET` for table chips.
- ✅ **Saved views that actually persist**
  - Backend: `View` model; `GET/POST/DELETE /api/cases/{case_id}/views`.
- ✅ **Export CSV / JSONL**
  - Backend: `POST /api/cases/{case_id}/timelines/{timeline_id}/export` accepting `format`
    and filter params; streams all matching events in batches. CSV includes forensic columns
    (`source_id`, `artifact`, `artifact_long`, `content_hash`, `file_hash`).

### 4. Real column filtering ✅

The backend `/events` endpoint supports `q`, `artifact`, `source_id`, `tag`, `exclude_tag`,
`start`, `end`, plus arbitrary field equality/exclusion filters via `filters` and
`exclusions` JSON query params.

### 5. Time visualization ✅

- ✅ **Backend histogram** — `GET /api/cases/{case_id}/timelines/{timeline_id}/histogram`
  returns bucket counts by time, honoring the same filters as the events list.

### 6. Anomaly / similarity panel ✅

- ✅ `GET /api/cases/{case_id}/timelines/{timeline_id}/events/{event_id}/similar`
- ✅ `GET /api/cases/{case_id}/timelines/{timeline_id}/anomalies`
- ✅ `POST /api/cases/{case_id}/timelines/{timeline_id}/anomalies/tag`
- Algorithm: distance-to-centroid / analyst-defined normal-baseline via Qdrant; honest
  "triage, not threat detection" framing.

### 7. Case management ✅

- ✅ **Delete case** — `DELETE /api/cases/{case_id}` cascades to Sources, Timelines,
  ClickHouse events, and Qdrant collections.

### 8. Embeddings per Source ✅

- ✅ **Generate vectors** — `POST /api/cases/{case_id}/sources/{source_id}/embed` starts a
  background job that reads the Source's events from ClickHouse, embeds them, and writes
  vectors to Qdrant.
- ✅ **Config isolation** — Qdrant collection names embed the embedding-config hash so
  incompatible models never mix.
- ✅ **Per-artifact field selection** — Sources can store an `embedding_config` that
  controls which fields of which artifacts are embedded.

## Implementation order

1. ✅ Source/Timeline/Artifact model refactor (`docs/MODEL_REFINEMENT.md`).
2. ✅ Source upload, retention, and download endpoints.
3. ✅ Timeline grouping and membership endpoints.
4. ✅ Real column filtering (include/exclude on fields and attributes) updated for new model.
5. ✅ Persisted saved views + backend endpoints.
6. ✅ Tag/comment annotations + backend endpoints.
7. ✅ Export CSV/JSONL + backend endpoint.
8. ✅ Time visualization histogram endpoint.
9. ✅ Anomaly/similarity endpoints wired to Qdrant.
10. ✅ Embeddings per Source with background jobs.

## Remaining work before MVP is closed

- **Authentication** — basic user auth so `created_by` and annotation attribution work.
- **Offline-mode enforcement** — prevent HuggingFace network calls when
  `allow_online=false`.
- **Frontend redesign** — the TypeScript contract and API clients are aligned; the UI
  components need to be rebuilt once the frontend stack is chosen.

## Notes

- All backend endpoints follow the FastAPI router pattern in
  `src/tracevector/api/routers/`.
- The backend is API-first; the frontend redesign is driven by the endpoints above.
