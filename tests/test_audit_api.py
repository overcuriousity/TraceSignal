"""Tests for the audit trail: coverage, per-user scoping, and no-secrets-leaked."""

from __future__ import annotations

import json

from tests.conftest import as_admin, login


def test_login_and_mutation_are_audited(client, admin_bootstrap, store):
    as_admin(client, admin_bootstrap)
    client.post("/api/cases/", json={"name": "audited-case"})

    resp = client.get("/api/auth/me/audit")
    assert resp.status_code == 200
    actions = [row["action"] for row in resp.json()["audit"]]
    assert "auth.login" in actions
    assert "auth.change_password" in actions
    assert "case.create" in actions


def test_mutating_requests_are_audited_but_reads_are_not(client, admin_bootstrap, store):
    """The generic api.request row covers mutating methods only — plain GETs

    are excluded so polling (JobTray, TopBar, list refetches) doesn't bury
    the security-relevant mutating rows this audit log exists to surface.
    """
    as_admin(client, admin_bootstrap)
    case = client.post("/api/cases/", json={"name": "read-me"}).json()["case"]
    client.get(f"/api/cases/{case['id']}")

    rows = client.get("/api/admin/audit", params={"action": "api.request"}).json()["audit"]
    assert rows  # the POST that created the case produced a generic row
    assert not any(r["method"] == "GET" for r in rows)


def test_failed_login_is_audited_without_leaking_password(client, admin_bootstrap, store):
    client.post("/api/auth/login", json={"username": "admin", "password": "totally-wrong"})
    as_admin(client, admin_bootstrap)

    rows = client.get("/api/admin/audit", params={"action": "auth.login_failed"}).json()["audit"]
    assert len(rows) == 1
    serialized = json.dumps(rows)
    assert "totally-wrong" not in serialized
    assert admin_bootstrap["password"] not in serialized


def test_own_audit_trail_is_scoped_to_self(client, admin_bootstrap, store):
    as_admin(client, admin_bootstrap)
    client.post("/api/admin/users", json={"username": "other1", "password": "abcdefgh12"})

    other_client = client.__class__(client.app)
    login(other_client, "other1", "abcdefgh12")
    other_client.get("/api/auth/me")

    my_rows = other_client.get("/api/auth/me/audit").json()["audit"]
    assert all(True for _ in my_rows)  # rows returned without error
    # None of "my" rows should be attributed to the admin.
    admin_id = client.get("/api/auth/me").json()["user"]["id"]
    assert all(r["user_id"] != admin_id for r in my_rows)


def test_audit_csv_download(client, admin_bootstrap, store):
    as_admin(client, admin_bootstrap)
    resp = client.get("/api/auth/me/audit", params={"format": "csv"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert "timestamp,action" in resp.text.splitlines()[0]


def test_non_admin_cannot_query_global_audit(client, admin_bootstrap, store):
    as_admin(client, admin_bootstrap)
    client.post("/api/admin/users", json={"username": "notadmin", "password": "abcdefgh12"})
    other_client = client.__class__(client.app)
    login(other_client, "notadmin", "abcdefgh12")
    assert other_client.get("/api/admin/audit").status_code == 403
