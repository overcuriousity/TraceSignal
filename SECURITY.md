# Security Policy

## Supported versions

TraceSignal is pre-1.0 and under active development. Security fixes are only
guaranteed for the latest commit on `main`.

## Reporting a vulnerability

Please **do not** open a public issue for suspected security vulnerabilities.

Instead, use GitHub's private reporting:
[Report a vulnerability](https://github.com/overcuriousity/TraceSignal/security/advisories/new)

Include:
- Affected component (ingestion, API, auth, frontend, deployment)
- Steps to reproduce or a proof of concept
- Impact (e.g. auth bypass, data exposure, injection, RCE)

We'll acknowledge reports and follow up with a fix timeline. Since TraceSignal
is designed for airgapped/offline forensic environments, issues around
unintended network egress (violations of `TS_ALLOW_ONLINE`) are treated as
security-relevant, not just bugs.

## Scope

In scope: the application itself (`src/tracesignal/`, `frontend/`), its
authentication/RBAC/audit layer, and the reference `docker-compose.yml`
deployment. Out of scope: vulnerabilities in third-party dependencies
(PostgreSQL, ClickHouse, Qdrant) — report those upstream; Dependabot tracks
known CVEs in this repo's dependency graph.
