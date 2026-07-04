# TraceSignal Roadmap — Phase 2 (hardening backlog)

Phase 1 (source management, timelines, explorer, anomaly engine, auth/RBAC/audit,
visualization, converters) is complete — see
[`docs/archive/ROADMAP_PHASE1.md`](./archive/ROADMAP_PHASE1.md).

This phase consolidates the remaining findings from the 2026-07-03 repository audit.
The audit's Critical/High items were fixed directly on `fix/audit-critical-high`:

- ✅ **C1** — Dockerfile CMD pointed at a nonexistent `api.main:app`; now `--factory create_app`.
- ✅ **H1** — CSV parser read the whole file into memory (`lines = list(fh)`); now streams with
  incremental byte-offset/line tracking (`ingestion/parser.py::_RecordTrackingIterator`).
- ✅ **H2** — Airgap enforcement: `tsig-web` no longer runs `npm install` on every start
  (builds only when `dist/` is missing; `TS_FRONTEND_REBUILD=1` forces); uvicorn reloader is
  development-only; embedding model load forces `HF_HUB_OFFLINE` unless `TS_ALLOW_ONLINE` and
  fails with an actionable message instead of silently downloading.
- ✅ **H3** — Blocking ClickHouse calls in async handlers (`list_events`, histogram, bulk
  annotate, field/artifact/tag listings, embedding-field recommenders) now go through
  `run_in_threadpool`, matching viz/anomaly endpoints. Convention: **every**
  `EventQueryService` call from an `async def` handler must be threadpool-wrapped.
- ✅ **H4** — Uploads: single-pass copy+hash off the event loop
  (`ingestion/files.py::copy_and_hash`), capped by `TS_MAX_UPLOAD_BYTES`
  (default 10 GiB, 0 disables) with a 413 mid-stream rejection.

Point-in-time PR review findings are archived under `docs/archive/PR{N}_REVIEW_FINDINGS.md`
(full unrestricted finding set, one file per reviewed PR) once triaged into this backlog or
resolved — this file holds only the condensed, still-open action items.

## Milestone 1 — correctness & forensic integrity (Medium severity)

- [ ] **M1 — No silent failures on evidence mutation.** `ClickHouseStore.delete_source_events`
  swallows all exceptions (`db/clickhouse.py`, bare `except: pass` around DROP PARTITION);
  `cases.py` ingest-failure cleanup likewise. A failed delete must log loudly and surface to
  the caller — orphan events reappearing after a "successful" source delete is a forensic
  integrity bug. Distinguish "partition doesn't exist" (fine, no-op) from real errors.
- [ ] **M2 — One SQL escaping regime.** `db/clickhouse.py::count_events` interpolates with
  `{value!r}`; `delete_source_events` f-strings IDs into the partition expression. Everything
  else in `db/` uses `{name:String}` binds. Parameterize both (or validate ID charset
  explicitly where DROP PARTITION can't bind). Low exploitability today (IDs are
  server-generated and RBAC-validated) but two regimes is how injection ships later.
- [ ] **M3 — Login backoff.** No rate limiting on `POST /api/auth/login`; argon2 slows one
  attempt, not a loop. In-memory per-username+IP failure counter with exponential delay fits
  the single-process design.
- [ ] **M4 — Compose network hygiene.** Reference `docker-compose.yml` publishes Postgres
  (default creds), ClickHouse (default user, no password) and Qdrant (no auth) to the host —
  app-layer RBAC is bypassable by anyone with network reach. Keep backing services on the
  compose-internal network by default; document a dev override file that exposes them.
- [ ] **M9 — Enricher singleton race (PR #54).** `enrichers/registry.py` registers one shared
  `GeoIPEnricher()` instance; `enrichers/jobs.py`'s `finally` unconditionally calls
  `enricher.close()`. Concurrent runs of the same enricher (auto-trigger overlapping a manual
  "Run now") race on the shared `_reader`, and the broad `except ValueError` in `enrich_value`
  silently swallows the resulting failure as "no match" instead of surfacing it. Needs either
  per-run instantiation or a lock, plus narrower exception handling. Also add dedup so two
  runs for the same `(timeline_id, enricher_key)` can't overlap in the first place. Full
  detail: `docs/archive/PR54_REVIEW_FINDINGS.md` #1, #2, #6.
- [ ] **M10 — `enricher_config_hash` never populated (PR #54).** The `event_enrichments`
  column exists specifically to distinguish which enricher config/database version produced a
  row but is always written `""` — defeats forensic reproducibility once a GeoIP database is
  ever replaced. Detail: `PR54_REVIEW_FINDINGS.md` #3.
- [ ] **M11 — GeoIP database upload/replace gaps (PR #54).** Upload validation only checks the
  `.mmdb` opens, not that it's City-flavored (a Country-only upload fails silently on first
  real job run); replacing the database doesn't reset the shared reader, so an in-flight job
  keeps resolving against the old file. Detail: `PR54_REVIEW_FINDINGS.md` #4, #5.
- [ ] **M12 — `EnrichersDialog.tsx` lost-update race (PR #54).** Toggle and mode mutations
  both close over stale enricher state; rapid interaction can silently revert a just-made
  change before the refetch lands. Detail: `PR54_REVIEW_FINDINGS.md` #7.
- [ ] **M13 — Orphan enrichment job reconciliation discards unflushed work silently (PR #54).**
  A crash just before a flush interval loses that interval's computed rows with only a warning
  log — no automatic re-run triggered, despite the docstring implying resumability. Detail:
  `PR54_REVIEW_FINDINGS.md` #8.

## Milestone 2 — high-leverage improvements

- [ ] **M5 — Dependency diet.** `torchvision`, `onnxruntime`, `jinja2` are declared but never
  imported; `alembic` is unused (migrations are hand-rolled additive ALTERs in
  `postgres.py::init_schema`). Remove them. Then consider moving `torch`/
  `sentence-transformers` to an optional `embeddings` extra with graceful capability
  degradation (health endpoint flag, clear error on embed endpoints) so the base install
  drops ~2 GB.
- [ ] **M7 — JobStore cap.** `core/jobs.py` never prunes; long-lived server leaks job dicts.
  Retain last N (e.g. 200) terminal jobs, evict oldest. Stays ephemeral/in-memory by design.
- [ ] **M8 — Remove dead `secret_key` setting.** `core/config.py` defines it, nothing reads it
  (sessions are DB-backed random tokens); `docker-compose.yml` dutifully sets it. Delete both
  or actually use it.
- [ ] **Container smoke test in CI.** Build the image, `docker compose up`, curl
  `/api/health`. Would have caught C1 before it shipped.
- [ ] **M15 — Precompute per-source field stats at ingest time.** Four call sites do a live
  full-scan ClickHouse aggregation over `events` on every read — `db/anomaly_stats.py`'s
  `field_inventory` (backs both the Visualize page's field dropdown and the anomaly wizard's
  field recommender), `db/queries.py::list_fields` (Explorer ColumnPicker),
  `db/queries.py::field_coverage` (timeline-creation wizard, scans up to 20k rows/source with
  sample values every time the wizard opens), and `db/queries.py::list_fields_by_artifact`.
  Since sources are immutable once ingested, none of this needs to be live: compute once per
  source right after ingestion (same trigger point `_trigger_automatic_enrichments` uses),
  cache in Postgres keyed by `source_id`, and merge cheaply per timeline. `coverage` merges
  exactly via addition; exact `distinct` needs a sketch (HyperLogLog) or a cheap approximation
  (e.g. max-across-sources) since it only feeds a UI hint. Short-term mitigation already
  shipped: `VisualizePage` shows a "can take a while" hint under the spinner and the field
  dropdown scrolls instead of overflowing (`ui/Select.tsx`).
- [ ] **M16 — Enricher subsystem cleanup pass (PR #54).** Lower-severity design/reuse/
  efficiency items to fold in when next touching this code — full detail and rationale in
  `docs/archive/PR54_REVIEW_FINDINGS.md` #9–#34:
  - GeoIP is special-cased throughout the frontend/admin instead of the enricher abstraction
    being load-bearing (hardcoded admin card, hardcoded field-key prefixes in
    `countryFlag.ts`, GeoIP-only badge logic baked into the generic Explorer cell renderer,
    asset-upload bolted onto the generic config endpoint pattern) — #9–#14.
  - Reuse: hand-rolled IPv4 regex in both `geoip.py` and `privateIp.ts` instead of stdlib
    `ipaddress`; manual `asyncio.create_task` + tracking set instead of `BackgroundTasks`;
    pagination loop duplicated from `EmbeddingPipeline`; temp-file upload boilerplate
    duplicated between `admin.py`/`cases.py`; orphan reconciliation duplicated from
    `api/main.py`'s ingest cleanup — #15–#20.
  - Simplification: unnecessary task-tracking set, duplicated `DROP PARTITION` statements,
    duck-typed `close()` instead of a base-class no-op, `output_fields` duplicated as literal
    dict keys, "effective config" computed twice with diverging logic, status endpoint
    triggering a full availability sweep — #21–#26.
  - Efficiency: unconditional `_hydrate_enrichments` query on every Explorer page load even
    with no enrichers configured; sequential per-source `count_events` calls; sequential
    (not concurrent) field-key and eligibility queries; `check_availability` mmaps the whole
    database just to prove it's readable — #27–#31.
  - Minor: `isPrivateIpv6` misses some valid representations; undocumented `sorted(keys)`
    behavior change; `field_key` cardinality can balloon the ColumnPicker on wide datasets —
    #32–#34.

## Milestone 3 — polish

- [ ] Split `api/routers/events.py` (1500+ lines: query parsing, export streaming, anomaly
  orchestration, bulk annotation) opportunistically when next touched — not proactively.
- [ ] `ClickHouseStore._host/_port` string-splitting breaks on `https://` and creds-in-URL
  forms — use `urllib.parse`.
- [ ] Startup config sanity report: log resolved offline mode, cookie security
  (warn when `environment=production` and `auth_cookie_secure=false`), datastore targets.
- [ ] Large-file ingest regression test: bound peak memory (or assert lazy yielding) over a
  generated ~100 MB CSV, protecting the H1 fix.

## Explicitly out of scope (decided during the audit)

- Persistent job store — in-memory is a documented deliberate choice for the single-process
  deployment model.
- CSRF tokens — SameSite=Lax cookies plus the LAN threat model are adequate for now.
- Alembic adoption — hand-rolled additive migration works at the current schema churn;
  revisit at v1.0.
- Proactive router/query-builder splits — churn risk outweighs payoff at current velocity.
