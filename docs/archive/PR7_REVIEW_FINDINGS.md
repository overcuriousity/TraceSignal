# Review: PR #7 — auth, RBAC, teams, audit trail, live collaboration

*Reviewed 2026-07-02 against branch `feat/auth-rbac-audit` (PR #7, base `main`). 8 finder
angles, one verifier per deduplicated correctness candidate; verdicts noted per finding.*

The PR adds the full identity layer: session-cookie auth with a seeded bootstrap admin,
optional OIDC, teams with member/manager roles, a case-RBAC dependency layer wired into every
case-scoped endpoint, an append-only audit-log ASGI middleware, an SSE invalidation stream,
and the corresponding frontend (login, admin console, settings, case-ownership UI). The
overall architecture is sound — the RBAC dependency design in `deps.py` and the plain-ASGI
middleware choice for SSE are both right — but verification confirmed several real security
and correctness gaps, mostly at the seams between the new subsystems.

**Resolution pass:** 2026-07-02, same day. All 12 confirmed/plausible findings and all 11
cleanup items addressed — 21 fixed, 2 (item 9's `access_level`-from-API and the SSE
histogram/anomaly invalidation gap) deliberately left as documented follow-ups rather than
done partially, 1 (#9's deeper `Job.case_id` authorization redesign) explicitly descoped as
beyond the guard-fix requested. Backend: 261 tests passing, `ruff check`/`ruff format --check`
clean. Frontend: 23 tests passing, `tsc`/`oxlint`/`vitest`/`vite build` clean. A1, A3, and A8
were additionally verified live against a running `uvicorn` process over real HTTP.

## Resolution summary

| # | Status | What happened |
|---|--------|----------------|
| 1 | ✅ Fixed | `must_change_password` gate centralized in `AuthAuditMiddleware` — blocks every mutating `/api/*` request (closing the `admin.py` gap), except `/api/auth/*` self-service routes. Per-route `require_password_current` left in `cases.py`/`events.py` as defense in depth. |
| 2 | ✅ Fixed | SSE loop re-validates session + case access on every 20s keepalive tick via `resolve_user_optional`/`resolve_case_access`, not just at connect. |
| 3 | ✅ Fixed | `AuthAuditMiddleware` now added before `CORSMiddleware`, making CORS outermost so preflight/401 responses carry CORS headers. |
| 4 | ✅ Fixed | `rotate_password` rejects OIDC accounts with 409; frontend hides the rotate-password control for non-local users. |
| 5 | ✅ Fixed | `list_cases_for_user`'s owner match now restricted to `team_id IS NULL` — a team-case owner removed from the team loses access instead of dead-ending. |
| 6 | ✅ Fixed | `/api/health` now exposes `oidc_enabled`; `LoginPage.tsx` reads it via a cached query instead of the dead `VITE_OIDC_ENABLED` build-time env var. |
| 7 | ✅ Fixed | `reassignTo` threaded through `mutate(reassignTo)` directly instead of relying on a stale closure from `setReassignTo`. |
| 8 | ✅ Fixed | `create_team` pre-checks via new `get_team_by_name` and returns 409 on collision, matching `create_user`'s pattern. |
| 9 | ✅ Fixed | Legacy-job guard flipped to `not user.is_admin and (job.created_by is None or job.created_by != user.id)`. Deeper `Job.case_id`/`resolve_case_access` redesign explicitly **not** done — flagged as a real follow-up in `docs/PROGRESS.md`. |
| 10 | ✅ Fixed | All 5 argon2 call sites wrapped in `asyncio.to_thread(...)`. |
| 11 | ✅ Fixed | `touch_session` debounced to 60s (using the existing `last_seen_at` field); generic `api.request` audit row restricted to mutating methods; fallback `api.request_failed` row added for `/api/auth/*` requests that raise before their handler's own audit call; `purge_expired_sessions()` wired into the startup lifespan hook. |
| 12 | ✅ Documented | OIDC's exemption from `TV_ALLOW_ONLINE` recorded in `TECH_STACK.md` §6 and `CLAUDE.md`; no code change (as the finding itself judged this not clear-cut). |
| Cleanup 1 | ✅ Fixed | `deps.py::_aware()` deleted; uses `db/_dt.py::ensure_utc` instead. |
| Cleanup 2 | ✅ Fixed | Moved to `core/events_bus.py::publish_annotation_change` (public, shared), used by both `cases.py` and all 3 `events.py` call sites. |
| Cleanup 3 | ✅ Fixed | `checkResponse(res, path)` extracted in `client.ts`, used by all four fetch helpers; `/auth/login` exclusion applied consistently. |
| Cleanup 4 | ✅ Fixed | `BASE` exported from `client.ts`; `useCaseStream.ts`/`auth.ts` import it instead of re-deriving. |
| Cleanup 5 | ✅ Fixed | Both dead `store.init_schema()` calls removed from `auth.py`. |
| Cleanup 6 | ✅ Fixed | Added `list_teams_for_user`/`list_members_with_users`/`list_unassigned_users` JOIN-based store methods, replacing all three N+1 loops. |
| Cleanup 7 | ✅ Fixed | `lineterminator="\n"` added to `_audit_rows_to_csv`'s `csv.DictWriter`, matching `_stream_csv`'s convention. |
| Cleanup 8 | ✅ Fixed | `record_audit(actor: User \| None)` added; all ~24 call sites swept to pass `actor=` (clean sweep, no compat shim, pre-production branch). |
| Cleanup 9 | ⏭ Follow-up, documented | Returning `access_level` from the API needs a bulk access-resolution path in `list_cases_for_user` to avoid a new N+1 — flagged as a follow-up in `caseAccess.ts` rather than done partially. |
| Cleanup 10 | ✅ Fixed | Extracted `usePasswordChangeForm()` hook (state/validation/mutation), shared by `ForcedPasswordChange.tsx` and `SettingsPage.tsx`; each kept its own layout. |
| Cleanup 11 | ✅ Fixed | `_fake_user()` moved to `tests/conftest.py`, imported by both test files. |
| SSE stale panels | ⏭ Follow-up, documented | `useCaseStream.ts`'s `INVALIDATE_PREFIXES` still doesn't cover histogram/anomaly-view query keys — needs reading those views' actual key names first, left as a follow-up. |

## Confirmed findings — security and correctness

### 1. Bootstrap admin bypasses forced password rotation on all admin endpoints
`src/tracevector/api/routers/admin.py:19` — **CONFIRMED**

The admin router depends only on `require_admin`; `require_password_current` is never applied
to it (its docstring in `deps.py:109` claiming coverage of "every mutating case/admin
endpoint" is false). Anyone holding the one-time `TV_ADMIN_PASSWORD` can log in with
`must_change_password=True` and immediately `POST /api/admin/users` with `is_admin: true` —
minting a permanent admin and defeating the one-time-credential design. The test suite never
catches this because `conftest.py`'s `as_admin` fixture always rotates the password first.

**Fix:** enforce the gate centrally (block non-exempt mutations in the middleware or
`get_current_user`) instead of per-endpoint opt-in, which is what allowed this drift within
the same PR.

### 2. Revoked sessions keep receiving the SSE stream forever
`src/tracevector/api/routers/stream.py:33` — **CONFIRMED**

Auth and case access are checked once at connect; the `while True` loop only checks client
disconnect. `change_my_password`'s own docstring promises "a stolen old cookie stops working
the moment the password changes," but an already-open stream survives password change,
deactivation, and team removal indefinitely (20s keepalives prevent idle timeout). The leak
is activity metadata (actor usernames, event/case IDs), not log content — but the revocation
guarantee is factually broken. No test covers mid-stream revocation.

**Fix:** the loop already wakes every 20s for keepalives — re-run
`resolve_user_optional` + `resolve_case_access` there and break on failure.

### 3. Middleware ordering breaks the advertised cross-origin mode
`src/tracevector/api/main.py:176` — **CONFIRMED**

`AuthAuditMiddleware` is added after `CORSMiddleware`, so it runs outermost: CORS preflight
`OPTIONS` requests (which never carry cookies) get a 401 before CORS ever answers, and all
401s lack `Access-Control-Allow-Origin`. In the direct cross-origin deployment that
`allow_origins=["http://localhost:5173"]` + `allow_credentials=True` explicitly supports,
every preflighted request fails as an opaque `TypeError`, and `client.ts`'s `onUnauthorized`
login-redirect never fires. The Vite-proxy dev path is same-origin and unaffected, which is
why nobody noticed.

**Fix:** swap the `add_middleware` order (add `AuthAuditMiddleware` first so CORS wraps it)
or exempt `OPTIONS` in the middleware.

### 4. Rotating a password on an OIDC account locks the user out with an unusable password
`src/tracevector/api/routers/admin.py:147` + `auth.py:105` — **CONFIRMED**

`rotate_password` has no `auth_provider` guard and the frontend offers it for every user row
(`AdminUsersPage.tsx:97`); but `login()` rejects any non-`local` account, so the minted
password is unusable at login. Since `force_change` defaults to true and the OIDC callback
never clears `must_change_password`, the user's sessions are revoked and after OIDC re-login
they are blocked by the forced-change gate — passable only if the admin communicates the
temporary password out-of-band. The resulting local password then lingers unmanageable
(`SettingsPage.tsx` hides password management for OIDC users).

**Fix:** reject rotation for OIDC accounts (409), or make it a real "set local password"
feature that login honors.

### 5. A team-case owner removed from the team sees a case they can't open
`src/tracevector/db/postgres.py:659` + `deps.py:132` — **CONFIRMED**

`list_cases_for_user` matches `Case.owner_id == user_id` regardless of `team_id`, but
`resolve_case_access` checks the team branch first and returns `NONE` for a non-member — the
owner branch is only reachable for personal cases. The state is reachable today (manager
creates a team case, admin removes them from the team): the case card lists but every click
dead-ends in 403. `frontend/src/lib/caseAccess.ts` mirrors the same mismatch.

**Fix:** align the list query with `resolve_case_access` (owner condition only where
`team_id IS NULL`), or decide owners keep access and fix `resolve_case_access` instead.

### 6. The SSO button is dead code in any stock build
`frontend/src/pages/LoginPage.tsx:20` — **CONFIRMED**

The button is gated on `import.meta.env.VITE_OIDC_ENABLED`, which nothing in the repo sets —
no frontend `.env`, no Vite `define`, not in `.env.example`'s flow, and `tv-web`'s auto-build
passes no env. No API endpoint exposes `oidc_enabled` either. Operators who configure
`TV_OIDC_ENABLED=true` get working backend endpoints with no way to reach them from the UI.

**Fix:** expose the flag via an unauthenticated config/health endpoint and gate at runtime.

### 7. "Reassign to me & delete" needs two clicks
`frontend/src/pages/admin/AdminUsersPage.tsx:307` — **CONFIRMED**

The handler calls `setReassignTo(me?.id)` then `mutate()` synchronously; the `mutationFn`
closes over the click-time render's `reassignTo === undefined` (verified against the
installed react-query 5.101.2 internals), so the DELETE is resent without `reassign_to` and
409s again. Deletion only succeeds on a second click after the re-render.

**Fix:** pass the value through `mutate(me?.id)` with
`mutationFn: (reassignTo?: string) => …`.

### 8. Duplicate team name returns 500
`src/tracevector/api/routers/admin.py:221` — **CONFIRMED**

`Team.name` is `unique=True` (`postgres.py:456`) but `create_team` neither pre-checks nor
catches `IntegrityError` — the second `POST /api/admin/teams {"name": "Ops"}` is an unhandled
500 where `create_user` in the same file returns a clean 409 and `add_team_member` pre-checks
memberships.

**Fix:** add the same pre-check (or catch the constraint violation) and return 409.

### 9. Legacy-job guard does the opposite of its docstring (latent)
`src/tracevector/api/routers/jobs.py:28` — **CONFIRMED, currently unreachable**

`job.created_by is not None and …` short-circuits, making `created_by=None` jobs visible to
*every* authenticated user, while the docstring says admins only. Currently unreachable — the
single `job_store.create` call site passes `created_by`, and the store is in-memory so pre-PR
jobs can't exist — but the permissive default makes any future `create()` call that omits the
kwarg silently world-readable. Related: jobs are authorized by creator only, so a teammate
cannot poll a shared case's embed job, and an ex-member can keep polling one they started.

**Fix:** flip the condition to match the docstring; consider stamping `case_id` on `Job` and
authorizing via `resolve_case_access` instead of creator identity.

## Confirmed findings — performance and operability

### 10. argon2 runs synchronously on the event loop
`src/tracevector/api/routers/auth.py:106` — **CONFIRMED**

`verify_password`/`hash_password` (measured ~44ms per verify at the locked argon2-cffi 25.1.0
defaults: time_cost=3, 64MiB; ~90ms for the hash+verify pair in `change_my_password`) are
called directly in async handlers — including on the *failed*-login path — in a
single-process uvicorn deployment that also serves the SSE streams. Every login freezes all
concurrent requests; a burst of bad logins serializes the server. Also called sync in
`admin.py` `create_user`/`rotate_password` and `_seed_admin`.

**Fix:** `await asyncio.to_thread(...)` around the argon2 calls (argon2 releases the GIL, so
this genuinely parallelizes).

### 11. Per-request Postgres writes and an unbounded audit table
`src/tracevector/api/main.py:127` + `deps.py:77` — **CONFIRMED**

Each `/api/*` hit runs `get_session` + `get_user` + a `touch_session` UPDATE-and-commit, then
an inline `record_audit` INSERT — including GETs. `JobTray` polls every 1.2s with
`refetchIntervalInBackground: true` (~3,000 `api.request` rows/hour/tab during an embed job),
plus 15–30s refetch loops in TopBar/Explorer/lists. There is no retention:
`purge_expired_sessions` (`postgres.py:1636`) has zero call sites, and nothing prunes
`audit_log`, so poll noise buries the security-relevant rows the admin audit UI exists to
surface.

The flip side: excluding all of `/api/auth/*` from the middleware audit means an auth request
that errors *before* its handler's own `record_audit` call leaves no audit row at all. For a
forensic platform, an always-on baseline row (with semantic rows as enrichment) is the safer
contract.

**Fix:** restrict the generic `api.request` row to mutating methods (or make self-auditing
explicit route metadata rather than a path prefix), debounce `touch_session`
(only write when >60s stale), fold session+user resolution into one JOINed SELECT, and call
`purge_expired_sessions` from the lifespan hook.

## Plausible — conventions

### 12. OIDC egress bypasses the documented airgap gate; the exception exists only as a code comment
`src/tracevector/api/routers/auth.py:259` — **PLAUSIBLE**

CLAUDE.md forbids unconditional network paths and names `TV_ALLOW_ONLINE` as the mechanism;
`TECH_STACK.md` §10 still lists "allow_online … not checked at any network call site yet" as
the open enforcement item. The new IdP calls (discovery, token exchange, userinfo) check only
`TV_OIDC_ENABLED`, and `config.py:77` unilaterally declares OIDC "Independent of
`allow_online`". Since OIDC is off by default and operator-opted-in (and the IdP may live
inside the airgapped LAN), this is not a clear-cut violation — but this PR did not touch
`docs/` or CLAUDE.md, so the carve-out is unrecorded and an operator trusting
`TV_ALLOW_ONLINE=false` as the single offline switch can be surprised by egress.

**Fix:** record the exception in `TECH_STACK.md` §6 / CLAUDE.md, or honor `allow_online` in
the OIDC call sites.

## Cleanup findings (finder-stage, not individually verified)

Each names a concrete cost but did not go through a dedicated verify pass:

- `src/tracevector/api/deps.py:21` — `_aware()` re-implements `ensure_utc()` from
  `db/_dt.py`, a module whose own docstring says it exists because this exact coercion kept
  being re-fixed at call sites. Import it instead.
- `src/tracevector/api/routers/events.py:584` (and ~1451, ~1539) — three inline
  `get_event_bus().publish({...})` dicts duplicate `cases.py`'s `_publish_annotation_change`
  helper; the payload shape now lives in four places and can silently desync SSE consumers.
  Deeper fix: publish from the store/service layer so every annotation write path (future
  CLI/triage/bulk) notifies by construction.
- `frontend/src/api/client.ts:130` — the 401-handler + error-detail block is copy-pasted
  across `request`, `postForm`, `fetchBlob`, `fetchBlobGet`, and has already drifted (only
  `request()` excludes `/auth/login` from `onUnauthorized`). Extract one `checkResponse(res)`.
- `frontend/src/hooks/useCaseStream.ts:4` and `frontend/src/api/auth.ts:24` — both re-derive
  the API base instead of reusing an exported `BASE` from `client.ts`; a base-URL change
  would break exactly the two hardest-to-test flows (SSE, OIDC redirect).
- `src/tracevector/api/routers/auth.py:101` and `:327` — `store.init_schema()` on every
  login/OIDC callback is dead weight now that the lifespan hook initializes the schema.
- `src/tracevector/api/routers/auth.py:59` — `_teams_for_user` is an N+1 (one `get_team` per
  membership) on every login and `/me`; `admin.py:78` (`unassigned` filter) and
  `list_team_members` repeat the pattern. Single JOINs would do.
- `src/tracevector/api/routers/auth.py:206` — `_audit_rows_to_csv` duplicates the
  CSV-streaming machinery in `events.py::_stream_csv` while disagreeing on line endings
  (`\r\n` vs `\n` — a forensic-consistency wart), and streams a list already fully
  materialized in memory.
- `src/tracevector/db/postgres.py` `record_audit` — every caller passes
  `user_id=<actor>.id, username_snapshot=<actor>.username` separately (~20 sites); accepting
  an `actor: User | None` would prevent a call site forgetting the snapshot.
- `frontend/src/lib/caseAccess.ts:8` — the RBAC policy is a second, parallel implementation
  of `resolve_case_access`; returning an `access_level` field from the API (already computed
  per request) would collapse it to a field read.
- `frontend/src/components/auth/ForcedPasswordChange.tsx` / `SettingsPage.tsx` — identical
  password-change forms (same validation, error copy, mutation); extract a shared component.
- `tests/test_uploads.py:76` / `tests/test_events_router.py` — identical `_fake_user()`
  helpers despite this PR creating `tests/conftest.py`, the natural shared home.
- `frontend/src/hooks/useCaseStream.ts:9` — SSE invalidation refreshes annotation/tag query
  keys but not histogram/anomaly views, so bulk anomaly-tagging by a teammate leaves those
  panels stale.

## Summary

The single most important item is #1 (the bootstrap-admin bypass), and #1, #2, and #4
together suggest the same root cause: per-endpoint opt-in for cross-cutting auth policies.
Centralizing `require_password_current` enforcement and session re-validation would fix all
three classes at once.
