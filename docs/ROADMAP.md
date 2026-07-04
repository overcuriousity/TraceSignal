# TraceSignal Roadmap — Phase 2 (hardening backlog)

## Precompute per-source field stats at ingest time (2026-07-04)

The Visualize page's field dropdown (`GET .../viz/fields` →
`db/anomaly_stats.py::field_inventory`) does a live full-scan aggregation over `events` every
time the page loads, which can hang noticeably on large timelines (mitigated short-term with a
loading-state message + scrollable dropdown, see `VisualizePage.tsx`). Since **sources are
immutable once ingested** (`CLAUDE.md` data model), per-source field stats never change after
ingest — recomputing them live on every read is pure waste.

**Proposal:** compute field inventory once per source, right after ingestion finishes (same
background-job trigger point `_trigger_automatic_enrichments` already uses in `cases.py`), and
cache it (e.g. a small Postgres table keyed by `source_id`). A timeline's field list becomes a
cheap merge of its sources' cached rows instead of a fresh ClickHouse scan. Recompute is
triggered only for the newly-added source when a source is added to a timeline (including the
"all sources" timeline) — not a full rescan.

Nuance: `coverage` (event-count based) merges exactly via addition; exact `distinct` doesn't
merge across sources without a sketch (HyperLogLog) or re-scanning the union — start with a
cheap approximation (e.g. max-across-sources) since this feeds a UI hint, not forensic output,
and upgrade later only if it proves misleading.

- [ ] **`db/anomaly_stats.py::field_inventory`** — backs both `GET .../viz/fields`
  (`api/routers/viz.py:607`) and the anomaly wizard's `recommend_novelty_fields`
  (`anomaly_stats.py:443`). Same live-scan cost paid twice, by two different pages, for what is
  largely the same underlying per-source data.
- [ ] **`db/queries.py::list_fields`** — backs the Explorer ColumnPicker (`events.py:760`).
  Aggregates `groupUniqArrayArray(mapKeys(attributes))` across a timeline's sources on every
  call; same "recompute per source every read" shape.
- [ ] **`db/queries.py::field_coverage`** — backs the timeline-creation wizard's merge-candidate
  view (`GET /{case_id}/fields/coverage`, `cases.py:807`). Scans up to 20k rows per source with
  sample values every time the wizard is opened, even though it's only ever computed against
  already-ingested (immutable) sources.
- [ ] **`db/queries.py::list_fields_by_artifact`** — same per-source/per-artifact aggregation
  shape as `list_fields`, likely the same fix applies.

All four are instances of one underlying gap: nothing in the ingestion pipeline persists
derived per-source metadata, so every consumer re-derives it live from `events` on each page
load. Worth solving once as a shared "per-source field inventory" cache rather than four
separate optimizations — `field_coverage`'s sample-value requirement is the one wrinkle that
doesn't reduce to plain counts and needs its own thought.

## PR #54 review — enricher subsystem + GeoIP (2026-07-04)

Full findings from an 8-angle review of `feat/enricher-subsystem` (PR #54, not yet merged).
Adds a pluggable enricher subsystem (Timesketch-analyzer style) staged through Postgres,
flushed append-only to a new ClickHouse `event_enrichments` table, joined in at query time;
ships GeoIP (MaxMind GeoLite2) end to end. Mostly additive (2643+/14-, 34 files). Triage before
merge or as immediate follow-up.

### Correctness / concurrency (fix before or immediately after merge)

- [ ] **Shared enricher singleton race.** `enrichers/registry.py:52` registers one
  module-level `GeoIPEnricher()` instance; `enrichers/jobs.py:190-193`'s `finally` block
  unconditionally calls `enricher.close()`, nulling the shared `_reader`. Two concurrent runs of
  the same enricher (auto-trigger on ingest overlapping a manual "Run now", or two sources
  finishing close together) race: job A's `close()` can close/null the reader while job B is
  mid-`.city()` call. `geoip.py`'s `enrich_value` catches `ValueError` — the same exception a
  closed reader raises — and silently returns `None`, so job B completes as `"completed"`
  having silently produced incomplete enrichment for the rest of its run. No lock or per-run
  instantiation exists anywhere in `get_enricher`/`run_enrichment_job`.
- [ ] **No dedup of concurrent same-enricher runs.** Neither `_trigger_automatic_enrichments`
  (`api/routers/cases.py:331`) nor `run_timeline_enricher` (`cases.py:1372`) checks for an
  already-running job for the same `(timeline_id, enricher_key)`. An analyst clicking "Run now"
  while an auto-triggered run for the same timeline is in flight causes overlapping processing
  (wasted ClickHouse writes, deduped only by `argMax` at read time) and feeds directly into the
  singleton race above.
- [ ] **`enricher_config_hash` never populated.** `db/clickhouse.py:111,123,200` defines the
  column specifically to track which enricher configuration/database version produced a row,
  but nothing in `enrichers/jobs.py` ever sets it — it's always defaulted to `""`. Once a GeoIP
  database is replaced and re-run, old and new results are indistinguishable in ClickHouse — a
  direct gap against this repo's forensic-reproducibility requirement (`CLAUDE.md`).
  Distinguish "no config hash yet" from "hash intentionally reused" once addressed.
- [ ] **GeoIP upload doesn't validate database flavor.** `api/routers/admin.py:465-466`
  (`_validate_and_install`) only opens the `.mmdb` to confirm it's readable
  (`with geoip2.database.Reader(str(tmp_path)): pass`); it never confirms the database is
  City-flavored. `enrich_value` calls `.city()` unconditionally — uploading a valid
  GeoLite2-**Country** database passes validation, then raises an unhandled
  `InvalidDatabaseError` (not caught by `enrich_value`'s narrow
  `except (AddressNotFoundError, ValueError)`) the first time a job actually runs.
- [ ] **Stale reader after DB replace.** `admin.py`'s `upload_geoip_database` calls
  `refresh_availability()` after replacing the `.mmdb` file, which opens/closes its own
  throwaway `Reader` and never resets the live singleton's cached `_reader`. An enrichment job
  already holding the old reader open keeps resolving against the old database (mmap on the
  now-unlinked/replaced inode) for the rest of its run — no crash, but silently mixes two
  database versions' output in one job run with nothing distinguishing them (compounds the
  `enricher_config_hash` gap above).
- [ ] **`enrich_value`'s broad `except ValueError` conflates "no match" with "broken reader."**
  `enrichers/geoip.py`'s `except (geoip2.errors.AddressNotFoundError, ValueError): return None`
  swallows both an expected geolocation miss and a `ValueError` from a closed/corrupted reader
  (see the singleton race above) into the same silent `None` — no way to tell a legitimate miss
  from an internal failure, and no error is ever surfaced to the job or audit log.
- [ ] **`EnrichersDialog.tsx` lost-update race.** `onToggle`/`onModeChange`
  (`frontend/src/components/timelines/EnrichersDialog.tsx:84-88`) both call
  `configMutation.mutate(...)` closing over the same stale `e` from the last fetch;
  `onSuccess` only triggers an async `invalidateQueries`. Toggling enable then quickly changing
  the mode dropdown before the refetch lands sends the second mutation with the pre-toggle
  `enabled` value, silently reverting the just-made change.
- [ ] **Orphan reconciliation silently discards unflushed work.** `reconcile_orphaned_enrichment_jobs`
  (`enrichers/jobs.py`) discards all unflushed staged rows on crash recovery rather than
  resuming; the docstring's "results may already have been periodically flushed" phrasing could
  mislead a reader into assuming full resumability. A crash just before a flush interval loses
  that interval's computed rows with only a warning log + audit entry — no automatic re-run is
  triggered.

### Altitude — GeoIP special-cased instead of the enricher abstraction being load-bearing

- [ ] `frontend/src/pages/admin/AdminEnrichersPage.tsx` fetches the generic `adminConfigs()`
  list but renders exactly one hardcoded GeoIP card (`configs?.find(c => c.key === "geoip")`)
  instead of mapping over the list — a second enricher means copy-pasting the page.
- [ ] `frontend/src/lib/countryFlag.ts` hardcodes the `enrich.geoip_country_code__` /
  `enrich.geoip_country__` / `enrich.geoip_city__` field-key prefixes and is imported directly
  into `EventGrid.tsx` and `EventDetailPanel.tsx` — no registry mapping enricher key → cell
  decorator, so a second enricher needing any visual treatment requires new bespoke modules and
  new branches in both Explorer components.
- [ ] `EventGrid.tsx`'s generic dynamic-attribute cell renderer was modified to unconditionally
  check `isIpAddress`/`isPrivateIp` and render a GeoIP flag/public-private badge for *any*
  IP-shaped value, even when GeoIP was never enabled for that timeline — misleading UI plus a
  GeoIP-specific concern baked into otherwise-generic column code.
- [ ] `admin.py`'s GeoIP asset-upload endpoints (`/admin/enrichers/geoip/database` GET/POST,
  ~lines 431-493) are bolted directly onto the generic `/admin/enrichers/{key}/config` pattern
  with no abstraction for "an enricher declares it needs an uploaded asset" — a second
  asset-needing enricher requires duplicating the whole upload/validate/install/audit flow.
- [ ] The `field_key = f"{output_field}__{attr_key}"` naming convention
  (`enrichers/jobs.py:2151`) tying an enrichment field back to its source attribute is an
  implicit string-format contract duplicated independently in Python and in
  `countryFlag.ts`'s parsing logic, with no shared constant enforcing the delimiter on either
  side.
- [ ] `_hydrate_enrichments` (`db/queries.py:541`) is a one-off bolt-on only to the
  `query()`/Explorer read path (explicitly not wired into `field_filters`/FilterRail per its own
  docstring) — other read paths that show events (similarity search, anomaly detail views, CSV
  export) won't surface enrichment data unless someone remembers to call it there too.

### Reuse — new code re-implements existing patterns

- [ ] `enrichers/geoip.py:17-19` hand-rolls an `IPV4_REGEX` instead of using stdlib
  `ipaddress`, which six existing converter modules already use for the same purpose
  (`assets/converters/suricata2timesketch.py` and others).
- [ ] `frontend/src/lib/privateIp.ts:6-7` independently re-implements the same IPv4 regex in
  TypeScript — two hand-written definitions of "valid IPv4 octet string" with nothing keeping
  them in sync across languages.
- [ ] `api/routers/cases.py:39-41,361-376` reinvents fire-and-forget task lifecycle with a
  manual `_background_enrichment_tasks: set[asyncio.Task]` + `add_done_callback` instead of
  FastAPI's `BackgroundTasks.add_task`, which this same file already uses three other times.
- [ ] `enrichers/jobs.py`'s `run_enrichment_job` pagination loop re-implements the same
  manual offset/limit batching over `ch_store.list_events` that `ingestion/pipeline.py`'s
  `EmbeddingPipeline` already has for its own batch job — a pagination boundary bug would need
  fixing in two places.
- [ ] `admin.py`'s GeoIP upload and `cases.py`'s `upload_source` both re-implement the same
  "stream to temp file, unlink on every failure branch, atomically install" boilerplate inline
  rather than via a shared helper.
- [ ] `reconcile_orphaned_enrichment_jobs` duplicates the shape of the existing orphaned-ingest
  cleanup in `api/main.py` (acknowledged in its own docstring: "Mirrors the orphaned-ingest
  cleanup...") rather than factoring out a shared `reconcile_orphaned_jobs(...)` helper.

### Simplification

- [ ] `_background_enrichment_tasks` global tracking set exists only to stop asyncio GC'ing
  fire-and-forget tasks, but `_trigger_automatic_enrichments` is already invoked from inside a
  FastAPI background task — there's no latency reason not to just await the calls directly.
- [ ] `db/clickhouse.py:330-341`'s `delete_source_events` writes out the same
  `ALTER TABLE ... DROP PARTITION` twice (once for `events`, once for `event_enrichments`),
  each independently wrapped in `contextlib.suppress(Exception)`, instead of a `for table in
  (...)` loop.
- [ ] `jobs.py:191` duck-types an optional `close()` via `getattr`/`callable` instead of
  declaring a no-op default `close()` on the `Enricher` ABC — undocumented convention every
  future enricher author must independently discover.
- [ ] `geoip.py`'s `output_fields = ("geoip_country", "geoip_city", "geoip_country_code")`
  duplicates the same three string literals used as dict keys inside `enrich_value()` with no
  enforced relationship between the two lists.
- [ ] The "explicit per-timeline config overrides admin default" rule is computed twice with
  different logic: `list_timeline_enrichers` (`cases.py`) vs.
  `list_automatic_enrichers_for_source` (`db/postgres.py:1130`) — the latter also gates on
  `mode == "automatic"` while the former doesn't for the default case.
- [ ] `get_geoip_database_status` falls back to a full `refresh_availability()` sweep (which
  re-checks every registered enricher) just to answer a status GET for one key, instead of
  calling `GeoIPEnricher().check_availability()` directly when the cache is empty.

### Efficiency

- [ ] `_hydrate_enrichments` (`db/queries.py:562-572`) runs unconditionally on every Explorer
  event-page fetch, even when no enricher has ever run for the case — doubles ClickHouse
  round-trips on the hottest read path in the app. Primary-key-pruned so each call is cheap, but
  there's no case-level short-circuit for "no enrichments exist."
- [ ] `enrichers/jobs.py`'s progress-total setup calls `count_events` once per source
  sequentially, instead of the batch `source_ids: list[str]` parameter `count_events` already
  accepts — a timeline with 200 sources issues 200 round-trips just to compute a denominator.
- [ ] `list_fields`'s new enrichment-keys query runs strictly sequentially after the
  raw-attribute-keys query on the same client instead of concurrently — adds a full extra
  round-trip latency to every ColumnPicker load.
- [ ] `list_timeline_enrichers` awaits `check_eligibility` (a ClickHouse `match()` scan) one
  enricher at a time instead of concurrently — dialog latency will grow linearly with enricher
  count as more enrichers are registered, even though it's flat with only GeoIP today.
- [ ] `check_availability` opens a full `geoip2.database.Reader` (mmaps the whole `.mmdb`,
  tens of MB) purely to prove the file is readable, then discards it — repeated on every admin
  status-page cache miss instead of a cheap existence/magic-byte check.

### Minor / cosmetic

- [ ] `frontend/src/lib/privateIp.ts`'s `isPrivateIpv6` only recognizes the literal `"::1"` for
  loopback and only `fe8/fe9/fea/feb` prefixes for link-local — non-compressed loopback
  (`"0:0:0:0:0:0:0:1"`) or zone-suffixed link-local addresses are misclassified as "public" in
  the Explorer badge.
- [ ] `db/queries.py`'s `list_fields` silently changed `"attributes": keys` to
  `"attributes": sorted(keys)` — harmless today (both call sites only do `set(...)` on the
  result) but an unannounced, out-of-scope behavior change bundled into this PR.
- [ ] `field_key`'s cardinality grows with the number of distinctly-named IP-bearing attributes
  per source (`enrich.geoip_country__ip`, `enrich.geoip_country__source_ip`, ...) — on a wide or
  vendor-inconsistent dataset the ColumnPicker's "Enrichments" group could balloon with
  near-duplicate columns.

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
