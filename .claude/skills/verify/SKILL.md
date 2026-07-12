---
name: verify
description: Build/launch/drive recipe to verify Vestigo changes end-to-end against the real API, using the podman dev services but isolated databases.
---

# Verifying Vestigo changes end-to-end

Backing services (Postgres/ClickHouse/Qdrant) run via `podman compose up -d`
and are usually already up (`podman ps`). Never verify against the dev
databases — isolate with fresh DB names instead:

```bash
podman exec vestigo-postgres-1 psql -U vestigo -c "CREATE DATABASE tsig_verify"

VESTIGO_POSTGRES_URL="postgresql+asyncpg://vestigo:vestigo@localhost:5432/tsig_verify" \
VESTIGO_CLICKHOUSE_DATABASE="tsig_verify" \
VESTIGO_QDRANT_COLLECTION_PREFIX="tsig_verify" \
VESTIGO_ADMIN_PASSWORD="verifypass123" \
VESTIGO_ENVIRONMENT="production" \
uv run uvicorn vestigo.web.app:app --port 8099   # run in background
```

- The app auto-creates the ClickHouse database and runs Alembic on startup.
- `VESTIGO_ENVIRONMENT=production` avoids the dev auto-reloader (a file watcher
  that restarts mid-verification). Port 8099 avoids clashing with a dev
  instance on 8080. Ready when `GET /api/health` answers.
- `vestigo-web` builds `frontend/dist` if missing — importing
  `vestigo.web.app` triggers that too; a prebuilt dist is served as-is.

## Auth (session cookie)

```bash
curl -s -c cj.txt -X POST :8099/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"verifypass123"}'
# Bootstrap password is one-time; write endpoints 403 until rotated:
curl -s -b cj.txt -X POST :8099/api/auth/me/password -H 'Content-Type: application/json' \
  -d '{"current_password":"verifypass123","new_password":"Verify-pass-456"}'
```

## Seed data + typical flow

Timesketch CSV ingests with zero config; columns `datetime,timestamp_desc,source,message`
(`source` → the `artifact` event field). Generate rows in Python, then:

1. `POST /api/cases/` `{"name": ...}` → `case.id`
2. `POST /api/cases/{case}/sources` multipart `file=@x.csv` — background job;
   poll `GET /api/cases/{case}/sources` until `status: "ready"` (seconds for small files)
3. `POST /api/cases/{case}/timelines` `{"name": ..., "source_ids": [src]}`
4. Temporal detectors need a baseline definition:
   `POST /api/cases/{case}/timelines/{tl}/baselines`
   `{"name","baseline_start","baseline_end","suspect_windows":[{"label","start","end"}]}`
5. Run a detector: `GET /api/cases/{case}/timelines/{tl}/anomalies?detector=<id>&baseline_id=<bl>`
   (add `&persist=false` for probes); tag: `POST .../anomalies/tag`;
   inspect a persisted run: `GET /api/cases/{case}/detector-runs/{run_id}`;
   disposition (mark normal / dismiss / confirm):
   `POST .../dispositions` `{"kind":"normal","detector","field","value"}`

## Cleanup

```bash
pkill -f "uvicorn vestigo.web.app:app --port 8099"
podman exec vestigo-postgres-1 psql -U vestigo -c "DROP DATABASE IF EXISTS tsig_verify"
curl -s "http://localhost:8123/" --data "DROP DATABASE IF EXISTS tsig_verify"
```

## Gotchas

- User shell is fish, but Bash-tool commands run through bash — use bash syntax.
- The upload response has no `source.id`; it's `source_id` at the top level.
- `psql` inside the container; the host has no psql client.
