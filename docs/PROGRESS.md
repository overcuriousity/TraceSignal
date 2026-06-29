# TraceVector Implementation Progress

Last updated: 2026-06-27 (session 5)

This document tracks implementation progress against the MVP defined in
[`CONCEPT.md`](./CONCEPT.md) and the tech-stack decisions in
[`TECH_STACK.md`](./TECH_STACK.md).

## Overall completion

**Estimated MVP completion: 95 %**

## MVP feature checklist

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | **Ingestion (CLI-first)** | ✅ Done | Streaming CSV/JSONL parsers, `tv ingest` CLI, plus web-based drag-and-drop upload. |
| 2 | **Storage & Vector Backend** | ✅ Done | ClickHouse `events` table with token-bloom full-text index; Qdrant collections with embedding-config-hash isolation and vector-size config-match checks. |
| 3 | **Web UI (ELK-like investigation interface)** | 🔄 Redesign | API complete: search, source/tag/time-range filters, field-level include/exclude, saved views, case/timeline delete, tag/comment annotations, CSV/JSONL export. Frontend being redesigned from scratch (tech stack TBD). |
| 4 | **Anomaly & Similarity Panel** | ✅ Done | Distance-to-centroid outlier detection + similarity search wired end-to-end. Backend: `GET /anomalies`, `GET /events/{id}/similar`, `POST /anomalies/tag`. |
| 5 | **Deployment & Operation** | 🟡 Partial | Reference `docker-compose.yml` with fully-qualified image names (podman-compatible), `uv` workflow, environment-based config. Missing: authentication, GPU index selection, strict offline-mode guard for model downloads. |

## Completed architectural decisions

- ✅ Language & packaging: Python 3.13 + `uv`
- ✅ Web backend: FastAPI + Uvicorn
- ✅ CLI ingestion: Typer
- 🔄 Frontend: TBD (redesign in progress)
- ✅ Metadata store: PostgreSQL (async SQLAlchemy)
- ✅ Event store: ClickHouse
- ✅ Vector store: Qdrant (tested with v1.18.2)
- ✅ Embedding runtime: sentence-transformers (`all-MiniLM-L6-v2` baseline)

## Known gaps / next logical steps

1. ✅ **Event annotations** — `Annotation` model in PostgreSQL; `GET`/`POST`/`DELETE` per-event endpoints + bulk `GET /annotations` for table chips.
2. ✅ **Saved views** — `View` model in PostgreSQL; GET/POST/DELETE `/api/cases/{id}/views` endpoints.
3. ✅ **Podman compatibility** — `docker-compose.yml` updated to use fully-qualified `docker.io/…` image names; tested with podman-compose.
4. ✅ **Export** — `POST /api/cases/{id}/timelines/{id}/export`; streams CSV or JSONL respecting active filters.
5. ✅ **Anomaly panel** — distance-to-centroid outlier scoring via Qdrant; similarity search; system annotations with math; `POST /anomalies/tag` for bulk tagging.
6. **Authentication** — basic user auth for team access.
7. **Offline-mode enforcement** — prevent HuggingFace network calls when `allow_online=false`.
8. ✅ **Case/timeline deletion** — `DELETE` endpoints with cascade across ClickHouse + Qdrant + PostgreSQL.
9. **Time visualization** — `GET /histogram` endpoint returning bucket counts by time range.
