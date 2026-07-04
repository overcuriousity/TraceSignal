"""Tests for the admin GeoIP database upload endpoint.

A real GeoLite2 .mmdb fixture isn't vendored in this repo (MaxMind's
distributable test databases aren't available offline here), so tests that
need a readable database monkeypatch ``geoip2.database.Reader`` with a fake.
Covered: RBAC, invalid-file rejection, wrong-flavor (non-City) rejection,
and the City happy path including the metadata sidecar.
"""

from __future__ import annotations

import io

from tests.conftest import as_admin, login


def test_non_admin_cannot_upload_geoip_database(client, admin_bootstrap, store):
    as_admin(client, admin_bootstrap)
    client.post("/api/admin/users", json={"username": "plain", "password": "abcdefgh12"})

    plain_client = client.__class__(client.app)
    login(plain_client, "plain", "abcdefgh12")
    resp = plain_client.post(
        "/api/admin/enrichers/geoip/database",
        files={
            "file": (
                "GeoLite2-City.mmdb",
                io.BytesIO(b"not a real database"),
                "application/octet-stream",
            )
        },
    )
    assert resp.status_code == 403


def test_invalid_geoip_database_rejected(client, admin_bootstrap, store):
    as_admin(client, admin_bootstrap)
    resp = client.post(
        "/api/admin/enrichers/geoip/database",
        files={
            "file": (
                "GeoLite2-City.mmdb",
                io.BytesIO(b"not a real database"),
                "application/octet-stream",
            )
        },
    )
    assert resp.status_code == 400


class _FakeReader:
    """Stands in for geoip2.database.Reader — no real .mmdb is vendored."""

    database_type = "GeoLite2-City"

    def __init__(self, path):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def metadata(self):
        meta = type("Meta", (), {})()
        meta.database_type = self.database_type
        meta.build_epoch = 1700000000
        return meta


def test_country_flavored_database_rejected_with_actionable_message(
    client, admin_bootstrap, store, tmp_path, monkeypatch
):
    import geoip2.database

    class _CountryReader(_FakeReader):
        database_type = "GeoLite2-Country"

    monkeypatch.setattr(geoip2.database, "Reader", _CountryReader)
    monkeypatch.setattr(
        "tracesignal.enrichers.geoip.geoip_database_path", lambda: tmp_path / "GeoLite2-City.mmdb"
    )

    as_admin(client, admin_bootstrap)
    resp = client.post(
        "/api/admin/enrichers/geoip/database",
        files={
            "file": (
                "GeoLite2-Country.mmdb",
                io.BytesIO(b"country db bytes"),
                "application/octet-stream",
            )
        },
    )
    assert resp.status_code == 400
    assert "GeoLite2-Country" in resp.json()["detail"]
    assert "City database" in resp.json()["detail"]
    # Nothing installed.
    assert not (tmp_path / "GeoLite2-City.mmdb").exists()


def test_city_database_upload_installs_and_writes_sidecar(
    client, admin_bootstrap, store, tmp_path, monkeypatch
):
    import hashlib

    import geoip2.database

    from tracesignal.enrichers.geoip import read_geoip_sidecar

    target = tmp_path / "GeoLite2-City.mmdb"
    monkeypatch.setattr(geoip2.database, "Reader", _FakeReader)
    monkeypatch.setattr("tracesignal.enrichers.geoip.geoip_database_path", lambda: target)

    payload = b"city db bytes"
    as_admin(client, admin_bootstrap)
    resp = client.post(
        "/api/admin/enrichers/geoip/database",
        files={"file": ("GeoLite2-City.mmdb", io.BytesIO(payload), "application/octet-stream")},
    )
    assert resp.status_code == 200
    body = resp.json()
    expected_sha = hashlib.sha256(payload).hexdigest()
    assert body["sha256"] == expected_sha
    assert body["build_epoch"] == 1700000000
    assert body["database_type"] == "GeoLite2-City"

    assert target.read_bytes() == payload
    sidecar = read_geoip_sidecar(target)
    assert sidecar["sha256"] == expected_sha
    assert sidecar["database_type"] == "GeoLite2-City"


def test_geoip_status_reports_unavailable_before_upload(
    client, admin_bootstrap, store, tmp_path, monkeypatch
):
    from tracesignal.enrichers import registry
    from tracesignal.enrichers.geoip import GeoIPEnricher

    missing_path = tmp_path / "missing.mmdb"
    # The status endpoint resolves the path via geoip_database_path()
    # directly (not through the registry), so both must point at the same
    # (non-existent, test-isolated) location.
    monkeypatch.setattr("tracesignal.enrichers.geoip.geoip_database_path", lambda: missing_path)
    registry.register(GeoIPEnricher(db_path=missing_path))
    registry.refresh_availability()

    as_admin(client, admin_bootstrap)
    resp = client.get("/api/admin/enrichers/geoip/database")
    assert resp.status_code == 200
    body = resp.json()
    assert body["uploaded"] is False
    assert body["available"] is False


def test_list_enrichers_reports_geoip_unavailable(client, admin_bootstrap, store, tmp_path):
    from tracesignal.enrichers import registry
    from tracesignal.enrichers.geoip import GeoIPEnricher

    registry.register(GeoIPEnricher(db_path=tmp_path / "missing.mmdb"))
    registry.refresh_availability()

    as_admin(client, admin_bootstrap)
    resp = client.get("/api/enrichers")
    assert resp.status_code == 200
    enrichers = resp.json()["enrichers"]
    geoip_entry = next((e for e in enrichers if e["key"] == "geoip"), None)
    assert geoip_entry is not None
    assert geoip_entry["available"] is False
