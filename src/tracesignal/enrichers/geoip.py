"""GeoIP enricher: resolves IP-address attribute values to country/city via MaxMind GeoLite2.

Availability requires an admin-uploaded ``.mmdb`` database file (see
``api/routers/admin.py``'s upload endpoint). Since arbitrary ingested data has
no canonical "ip" field name, this enricher scans every attribute value that
matches the IPv4 pattern rather than a single hardcoded field — the job loop
(``enrichers/jobs.py``) is responsible for pairing each match back to the
source attribute key it came from.
"""

from __future__ import annotations

import hashlib
import ipaddress
import json
import logging
import os
from pathlib import Path
from typing import Any

import geoip2.database
import geoip2.errors

from tracesignal.core.config import get_settings
from tracesignal.enrichers.base import AvailabilityResult, Enricher

logger = logging.getLogger(__name__)

# IPv4 only for v1; IPv6 support is a documented follow-up.
#
# This is the *eligibility pattern*, not a validator: it is pushed into
# ClickHouse match() by check_eligibility and reused as the cheap per-value
# gate in is_field_eligible, so it must stay a ClickHouse-compatible re2
# regex. Correctness validation happens via stdlib ipaddress in enrich_value.
IPV4_REGEX = (
    r"^(?:(?:25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])$"
)

# Single source for the output-field names: the `output_fields` contract tuple
# and enrich_value's return-dict keys must always agree. Order is part of
# config_hash() — never reorder.
_FIELD_COUNTRY = "geo_country"
_FIELD_CITY = "geo_city"
_FIELD_COUNTRY_CODE = "geo_country_code"


def geoip_database_path() -> Path:
    """Return the configured on-disk path for the GeoLite2 database file."""
    return Path(get_settings().enricher_data_path) / "geoip" / "GeoLite2-City.mmdb"


def geoip_sidecar_path(db_path: Path | None = None) -> Path:
    """Return the metadata sidecar path recorded alongside the ``.mmdb`` at upload time."""
    base = db_path or geoip_database_path()
    return base.with_name(base.name + ".meta.json")


def write_geoip_sidecar(db_path: Path, metadata: dict[str, Any]) -> None:
    """Atomically write the database-identity sidecar next to the ``.mmdb`` file."""
    sidecar = geoip_sidecar_path(db_path)
    tmp = sidecar.with_suffix(".tmp")
    tmp.write_text(json.dumps(metadata, sort_keys=True, indent=2), encoding="utf-8")
    os.replace(tmp, sidecar)


def read_geoip_sidecar(db_path: Path) -> dict[str, Any] | None:
    """Return the sidecar's metadata dict, or None if missing/unreadable."""
    sidecar = geoip_sidecar_path(db_path)
    try:
        return json.loads(sidecar.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        while chunk := fh.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


class GeoIPEnricher(Enricher):
    """Resolves public IP addresses to country/city via a local MaxMind GeoLite2 database."""

    key = "geoip"
    display_name = "GeoIP (MaxMind GeoLite2)"
    description = (
        "Resolves IP address attribute values to country and city using a "
        "locally uploaded MaxMind GeoLite2 City database."
    )
    eligibility_regex = IPV4_REGEX
    output_fields = (_FIELD_COUNTRY, _FIELD_CITY, _FIELD_COUNTRY_CODE)

    def __init__(self, db_path: Path | None = None) -> None:
        self._db_path = db_path or geoip_database_path()
        self._reader: geoip2.database.Reader | None = None

    def spawn(self) -> GeoIPEnricher:
        """Fresh instance for one job run, keeping the configured database path."""
        return GeoIPEnricher(db_path=self._db_path)

    def check_availability(self) -> AvailabilityResult:
        if not self._db_path.exists():
            return AvailabilityResult(False, "GeoLite2 database not uploaded")
        # Sidecar-first: the .meta.json is written atomically with the install
        # (upload endpoint), so its database_type is trustworthy — no need to
        # mmap the whole .mmdb just to read metadata. Opening a Reader is the
        # fallback for pre-sidecar (hand-copied) installs only.
        meta = read_geoip_sidecar(self._db_path)
        if meta and meta.get("database_type"):
            database_type = str(meta["database_type"])
        else:
            try:
                with geoip2.database.Reader(str(self._db_path)) as reader:
                    database_type = reader.metadata().database_type
            except Exception as exc:  # noqa: BLE001
                return AvailabilityResult(False, f"Database unreadable: {exc}")
        if "City" not in database_type:
            return AvailabilityResult(
                False,
                f"Wrong database flavor: {database_type!r}; a City database is required",
            )
        return AvailabilityResult(True)

    def config_extras(self) -> dict[str, Any]:
        """Identity of the installed database file (hash + build metadata).

        Read from the sidecar written at upload time; for databases installed
        before the sidecar existed, compute it once and persist it (best
        effort — a read-only data dir just means recomputing next time).
        """
        meta = read_geoip_sidecar(self._db_path)
        if meta is None:
            with geoip2.database.Reader(str(self._db_path)) as reader:
                reader_meta = reader.metadata()
                meta = {
                    "sha256": _hash_file(self._db_path),
                    "build_epoch": reader_meta.build_epoch,
                    "database_type": reader_meta.database_type,
                }
            try:
                write_geoip_sidecar(self._db_path, meta)
            except OSError:
                logger.warning("Could not persist GeoIP metadata sidecar next to %s", self._db_path)
        return {
            "database_sha256": meta.get("sha256", ""),
            "build_epoch": meta.get("build_epoch", 0),
            "database_type": meta.get("database_type", ""),
        }

    def _get_reader(self) -> geoip2.database.Reader:
        if self._reader is None:
            self._reader = geoip2.database.Reader(str(self._db_path))
        return self._reader

    def close(self) -> None:
        """Release the open database file handle, if any."""
        if self._reader is not None:
            self._reader.close()
            self._reader = None

    def enrich_value(self, raw_value: str) -> dict[str, str] | None:
        """Resolve one IPv4 value, or None for invalid input / no geolocation match.

        Only an invalid address or a legitimate lookup miss maps to None —
        reader failures (closed handle, corrupt database) propagate so the
        job fails loudly instead of silently producing incomplete results.
        """
        try:
            ipaddress.IPv4Address(raw_value)
        except ValueError:
            return None
        try:
            response = self._get_reader().city(raw_value)
        except geoip2.errors.AddressNotFoundError:
            return None
        country = response.country.name or ""
        city = response.city.name or ""
        country_code = response.country.iso_code or ""
        if not country and not city:
            return None
        return {
            _FIELD_COUNTRY: country,
            _FIELD_CITY: city,
            _FIELD_COUNTRY_CODE: country_code,
        }
