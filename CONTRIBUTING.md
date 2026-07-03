# Contributing to TraceSignal

Thanks for considering a contribution. This is a small forensic-tooling
project — keep changes focused and read `CLAUDE.md` first, it documents the
architecture and conventions that both humans and AI assistants follow here.

## Getting set up

```bash
uv sync                          # backend deps
podman compose up -d              # PostgreSQL, ClickHouse, Qdrant for local dev
uv run tsig-web                   # API + built frontend on :8080
```

Frontend, for active UI work:

```bash
cd frontend
npm install
npm run dev                       # Vite dev server on :5173, proxies to :8080
```

## Before opening a PR

```bash
uv run pytest                     # backend tests (coverage on by default)
uv run ruff check . && uv run ruff format .
cd frontend && npm run typecheck && npm run lint && npm run test && npm run build
```

CI runs all of the above; a red check blocks merge.

## Conventions

- Ruff: `select = ["E", "F", "I", "UP", "B", "C4", "SIM"]`, line length 100,
  Google-style docstrings. `E501` is ignored — don't wrap lines purely for
  length.
- Forensic reproducibility is a hard requirement. `ParserConfig` and
  `EmbeddingConfig` are hashed (`config_hash()`) and treated as append-only —
  changing their fields changes their identity (new Qdrant collection, etc.),
  so don't casually rename/remove fields on them.
- Airgapped/offline-by-default is a design goal — no new code path should
  reach the network unconditionally. `TS_ALLOW_ONLINE` gates optional online
  behavior; OIDC SSO is the one deliberate exception (see `docs/TECH_STACK.md`).
- `core/jobs.py::JobStore` is intentionally in-memory/ephemeral — don't add
  persistence there without discussing the deployment-model implications
  first.

## Commit messages / PRs

Explain the *why*, not just the *what* — the diff already shows what changed.
Use the PR template's test-plan checklist; check the forensic-impact box
honestly if you touched a hashed config or the event schema.

## Reporting bugs / requesting features

Use the issue templates. Security vulnerabilities: see `SECURITY.md`, do not
file a public issue.
