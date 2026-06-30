# TraceVector Implementation Progress

Last updated: 2026-06-29 (session 6 — Case / Source / Timeline / Artifact refactor complete)

This document tracks implementation progress against the MVP defined in
[`CONCEPT.md`](./CONCEPT.md) and the tech-stack decisions in
[`TECH_STACK.md`](./TECH_STACK.md).

## Overall completion

**Estimated MVP completion: 95 %**

The backend model refactor, API, tests, and frontend TypeScript contract are complete.
The remaining work before MVP closure is **authentication**, **offline-mode enforcement**,
and the **frontend UI redesign**.

## MVP feature checklist

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | **Ingestion (CLI-first + web upload)** | ✅ Done | Streaming CSV/JSONL parsers; `tv ingest --source` CLI; web drag-and-drop via `POST /api/cases/{id}/sources`. |
| 2 | **Source / Timeline / Artifact model** | ✅ Done | `Source` = one file; `Timeline` = grouping; `Artifact` = per-event Plaso class. Implemented across Postgres, ClickHouse, Qdrant, API, CLI, and tests. |
| 3 | **Storage & Vector Backend** | ✅ Done | ClickHouse `events` table with `tokenbf_v1` full-text index; Qdrant collections keyed by `(case_id, embedding_config_hash)` with vector-size config-match checks. |
| 4 | **Web UI (ELK-like investigation interface)** | 🔄 Redesign | API complete: search, artifact/source_id filters, time-range, saved views, case/timeline/source delete, tag/comment annotations, CSV/JSONL export, histogram. Frontend being redesigned; TypeScript types are aligned. |
| 5 | **Anomaly & Similarity Panel** | ✅ Done | Distance-to-centroid + normal-baseline outlier detection; similarity search; `GET /anomalies`, `GET /events/{id}/similar`, `POST /anomalies/tag`. |
| 6 | **Deployment & Operation** | 🟡 Partial | Reference `docker-compose.yml` with fully-qualified image names (podman-compatible), `uv` workflow, environment-based config. Missing: authentication, GPU index selection, strict offline-mode guard for model downloads. |

## Completed architectural decisions

- ✅ Language & packaging: Python 3.13 + `uv`
- ✅ Web backend: FastAPI + Uvicorn
- ✅ CLI ingestion: Typer
- 🔄 Frontend: TBD (redesign in progress)
- ✅ Metadata store: PostgreSQL (async SQLAlchemy)
- ✅ Event store: ClickHouse
- ✅ Vector store: Qdrant (tested with v1.18.2)
- ✅ Embedding runtime: sentence-transformers (`all-MiniLM-L6-v2` baseline)
- ✅ Data model: Case / Source / Timeline / Artifact (see `MODEL_REFINEMENT.md`)

## Known gaps / next logical steps

1. ✅ **Event annotations** — `Annotation` model scoped by `source_id`; `GET`/`POST`/`DELETE` per-event endpoints + bulk `GET` for table chips.
2. ✅ **Saved views** — `View` model; `GET/POST/DELETE /api/cases/{id}/views`.
3. ✅ **Podman compatibility** — `docker-compose.yml` uses fully-qualified `docker.io/…` image names.
4. ✅ **Export** — `POST /api/cases/{id}/timelines/{id}/export`; streams CSV or JSONL respecting filters; CSV includes forensic columns.
5. ✅ **Anomaly panel** — outlier scoring, similarity search, system annotations with math, bulk tagging.
6. ✅ **Case/timeline/source deletion** — `DELETE` endpoints with cascade across ClickHouse + Qdrant + PostgreSQL.
7. ✅ **Time visualization** — `GET /histogram` endpoint returning bucket counts by time range.
8. ✅ **Source file retention & re-download** — content-addressed storage; `GET /sources/{id}/download`.
9. ✅ **Source-scoped embeddings** — `POST /sources/{id}/embed` background job; per-artifact field selection stored on Source.
10. **Authentication** — basic user auth for team access; needed to populate `created_by` and attribute annotations.
11. **Offline-mode enforcement** — prevent HuggingFace network calls when `allow_online=false`.
12. **Frontend redesign** — rebuild UI once tech stack is chosen; API contract is ready.
