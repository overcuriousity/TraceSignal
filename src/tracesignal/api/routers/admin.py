"""Admin console API: user, team, and membership management; global audit access.

Every endpoint in this router requires ``require_admin`` — only the
administrator role can create/delete users, rotate passwords, or manage
teams and memberships.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from tracesignal.api.deps import get_store, require_admin
from tracesignal.api.uploads import receive_upload_to_tmp
from tracesignal.core.config import get_settings
from tracesignal.core.security import hash_password
from tracesignal.db.postgres import User, generate_id

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


class UserCreate(BaseModel):
    """Payload to create a new local user account."""

    username: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=255)
    is_admin: bool = False
    display_name: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)


class UserUpdate(BaseModel):
    """Payload to patch mutable fields on a user."""

    username: str | None = Field(default=None, min_length=1, max_length=255)
    display_name: str | None = Field(default=None, max_length=255)
    is_admin: bool | None = None
    is_active: bool | None = None


class PasswordRotate(BaseModel):
    """Payload for an admin-initiated password rotation."""

    new_password: str = Field(..., min_length=8, max_length=255)
    force_change: bool = True


class TeamCreate(BaseModel):
    """Payload to create a new investigation team."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4096)


class MembershipCreate(BaseModel):
    """Payload to add a user to a team."""

    user_id: str = Field(..., min_length=1)
    role: str = Field(default="member", pattern="^(member|manager)$")


class MembershipRoleUpdate(BaseModel):
    """Payload to change a member's role within a team."""

    role: str = Field(..., pattern="^(member|manager)$")


# ═════════════════════════════════════════════════════════════════════════════
# Users
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/users")
async def list_users(unassigned: bool = Query(default=False)) -> dict[str, Any]:
    """List all users, optionally filtered to the team-less default pool."""
    store = get_store()
    users = await store.list_unassigned_users() if unassigned else await store.list_users()
    return {"users": [u.to_dict() for u in users]}


@router.post("/users")
async def create_user(payload: UserCreate, admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Create a new local user account."""
    store = get_store()
    if await store.get_user_by_username(payload.username) is not None:
        raise HTTPException(status_code=409, detail="Username already taken")
    password_hash = await asyncio.to_thread(hash_password, payload.password)
    user = await store.create_user(
        user_id=generate_id("user"),
        username=payload.username,
        password_hash=password_hash,
        is_admin=payload.is_admin,
        display_name=payload.display_name,
        email=payload.email,
    )
    await store.record_audit(
        action="admin.create_user",
        actor=admin,
        target_type="user",
        target_id=user.id,
        detail={"created_username": user.username},
    )
    return {"user": user.to_dict()}


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str, payload: UserUpdate, admin: User = Depends(require_admin)
) -> dict[str, Any]:
    """Patch a user's username/display name/admin flag/active flag."""
    store = get_store()
    target = await store.get_user(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.username and payload.username != target.username:
        existing = await store.get_user_by_username(payload.username)
        if existing is not None and existing.id != user_id:
            raise HTTPException(status_code=409, detail="Username already taken")
    if payload.is_admin is False and target.is_admin and target.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot remove your own admin privileges")
    updated = await store.update_user(
        user_id,
        username=payload.username,
        display_name=payload.display_name,
        is_admin=payload.is_admin,
        is_active=payload.is_active,
    )
    await store.record_audit(
        action="admin.update_user",
        actor=admin,
        target_type="user",
        target_id=user_id,
        detail=payload.model_dump(exclude_none=True),
    )
    return {"user": updated.to_dict()}


@router.post("/users/{user_id}/password")
async def rotate_password(
    user_id: str, payload: PasswordRotate, admin: User = Depends(require_admin)
) -> dict[str, Any]:
    """Rotate a user's password (admin-initiated). Revokes their existing sessions."""
    store = get_store()
    target = await store.get_user(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.auth_provider != "local":
        raise HTTPException(
            status_code=409,
            detail="Cannot set a local password for an OIDC-linked account",
        )
    new_hash = await asyncio.to_thread(hash_password, payload.new_password)
    await store.set_password(user_id, new_hash, must_change_password=payload.force_change)
    await store.revoke_user_sessions(user_id)
    await store.record_audit(
        action="admin.rotate_password",
        actor=admin,
        target_type="user",
        target_id=user_id,
    )
    return {"rotated": True}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    reassign_to: str | None = Query(default=None),
    admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """Delete a user account.

    Blocks with 409 if the user owns personal cases and ``reassign_to`` was
    not supplied — deleting a user must never silently orphan their cases.
    """
    store = get_store()
    target = await store.get_user(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    owned = await store.owned_case_count(user_id)
    if owned > 0 and not reassign_to:
        raise HTTPException(
            status_code=409,
            detail=f"User owns {owned} case(s). Pass reassign_to=<user_id> (e.g. yourself) to proceed.",
        )
    if reassign_to and await store.get_user(reassign_to) is None:
        raise HTTPException(status_code=404, detail="reassign_to user not found")

    await store.delete_user(user_id, reassign_cases_to=reassign_to)
    await store.record_audit(
        action="admin.delete_user",
        actor=admin,
        target_type="user",
        target_id=user_id,
        detail={"deleted_username": target.username, "reassigned_to": reassign_to},
    )
    return {"deleted": True}


# ═════════════════════════════════════════════════════════════════════════════
# Teams
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/teams")
async def list_teams() -> dict[str, Any]:
    """List all investigation teams."""
    store = get_store()
    return {"teams": [t.to_dict() for t in await store.list_teams()]}


@router.post("/teams")
async def create_team(payload: TeamCreate, admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Create a new investigation team."""
    store = get_store()
    if await store.get_team_by_name(payload.name) is not None:
        raise HTTPException(status_code=409, detail="Team name already taken")
    team = await store.create_team(
        team_id=generate_id(payload.name), name=payload.name, description=payload.description
    )
    await store.record_audit(
        action="admin.create_team",
        actor=admin,
        target_type="team",
        target_id=team.id,
    )
    return {"team": team.to_dict()}


@router.delete("/teams/{team_id}")
async def delete_team(team_id: str, admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Delete a team. Its cases become personal (owner retained), memberships are removed."""
    store = get_store()
    deleted = await store.delete_team(team_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Team not found")
    await store.record_audit(
        action="admin.delete_team",
        actor=admin,
        target_type="team",
        target_id=team_id,
    )
    return {"deleted": True}


@router.get("/teams/{team_id}/members")
async def list_team_members(team_id: str) -> dict[str, Any]:
    """List a team's members with their roles."""
    store = get_store()
    if await store.get_team(team_id) is None:
        raise HTTPException(status_code=404, detail="Team not found")
    members = [
        {**user.to_dict(), "role": role}
        for user, role in await store.list_members_with_users(team_id)
    ]
    return {"members": members}


@router.post("/teams/{team_id}/members")
async def add_team_member(
    team_id: str, payload: MembershipCreate, admin: User = Depends(require_admin)
) -> dict[str, Any]:
    """Add a user to a team with the given role."""
    store = get_store()
    if await store.get_team(team_id) is None:
        raise HTTPException(status_code=404, detail="Team not found")
    if await store.get_user(payload.user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    if await store.get_membership(team_id, payload.user_id) is not None:
        raise HTTPException(status_code=409, detail="User is already a member of this team")
    membership = await store.add_membership(team_id, payload.user_id, role=payload.role)
    await store.record_audit(
        action="admin.add_team_member",
        actor=admin,
        target_type="team",
        target_id=team_id,
        detail={"member_user_id": payload.user_id, "role": payload.role},
    )
    return {"membership": membership.to_dict()}


@router.patch("/teams/{team_id}/members/{member_user_id}")
async def set_team_member_role(
    team_id: str,
    member_user_id: str,
    payload: MembershipRoleUpdate,
    admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """Change a team member's role."""
    store = get_store()
    updated = await store.set_membership_role(team_id, member_user_id, payload.role)
    if not updated:
        raise HTTPException(status_code=404, detail="Membership not found")
    await store.record_audit(
        action="admin.update_team_member",
        actor=admin,
        target_type="team",
        target_id=team_id,
        detail={"member_user_id": member_user_id, "role": payload.role},
    )
    return {"updated": True}


@router.delete("/teams/{team_id}/members/{member_user_id}")
async def remove_team_member(
    team_id: str, member_user_id: str, admin: User = Depends(require_admin)
) -> dict[str, Any]:
    """Remove a user from a team."""
    store = get_store()
    removed = await store.remove_membership(team_id, member_user_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Membership not found")
    await store.record_audit(
        action="admin.remove_team_member",
        actor=admin,
        target_type="team",
        target_id=team_id,
        detail={"member_user_id": member_user_id},
    )
    return {"removed": True}


# ═════════════════════════════════════════════════════════════════════════════
# Global audit
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/audit")
async def query_audit(
    user_id: str | None = Query(default=None),
    case_id: str | None = Query(default=None),
    action: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=10000),
) -> dict[str, Any]:
    """Query the global audit trail, filterable by user/case/action."""
    store = get_store()
    rows = await store.query_audit(user_id=user_id, case_id=case_id, action=action, limit=limit)
    return {"audit": [r.to_dict() for r in rows]}


# ═════════════════════════════════════════════════════════════════════════════
# Enricher assets (GeoIP database upload)
# ═════════════════════════════════════════════════════════════════════════════


class EnricherGlobalConfigUpdate(BaseModel):
    """Payload to set an enricher's instance-wide defaults."""

    auto_run_default: bool


@router.get("/enrichers/config")
async def list_enricher_global_configs(admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Return every registered enricher with its instance-wide config."""
    from tracesignal.enrichers.registry import all_enrichers, get_cached_availability

    store = get_store()
    configs = {c.enricher_key: c for c in await store.list_enricher_global_configs()}
    result = []
    for enricher in all_enrichers():
        availability = get_cached_availability(enricher.key)
        config = configs.get(enricher.key)
        result.append(
            {
                "key": enricher.key,
                "display_name": enricher.display_name,
                "description": enricher.description,
                "available": availability.available if availability else False,
                "reason": availability.reason if availability else None,
                "auto_run_default": config.auto_run_default if config else False,
            }
        )
    return {"enrichers": result}


@router.put("/enrichers/{enricher_key}/config")
async def set_enricher_global_config(
    enricher_key: str,
    body: EnricherGlobalConfigUpdate,
    admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """Set instance-wide defaults for one enricher (currently: auto-run on ingest)."""
    from tracesignal.enrichers.registry import get_enricher

    if get_enricher(enricher_key) is None:
        raise HTTPException(status_code=404, detail="Unknown enricher")

    store = get_store()
    config = await store.upsert_enricher_global_config(
        enricher_key=enricher_key,
        auto_run_default=body.auto_run_default,
        updated_by=admin.id,
    )
    await store.record_audit(
        action="admin.enricher_global_config",
        actor=admin,
        target_type="enricher",
        target_id=enricher_key,
        detail={"auto_run_default": body.auto_run_default},
    )
    return {"config": config.to_dict()}


@router.get("/enrichers/geoip/database")
async def get_geoip_database_status(admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Return whether a GeoLite2 database is currently uploaded and its availability."""
    from tracesignal.enrichers.geoip import geoip_database_path, read_geoip_sidecar
    from tracesignal.enrichers.registry import get_cached_availability, refresh_availability

    path = geoip_database_path()
    exists = await asyncio.to_thread(path.exists)
    size_bytes = await asyncio.to_thread(lambda: path.stat().st_size) if exists else None
    sidecar = await asyncio.to_thread(read_geoip_sidecar, path) if exists else None
    availability = get_cached_availability("geoip") or (
        await asyncio.to_thread(refresh_availability, "geoip")
    ).get("geoip")
    return {
        "uploaded": exists,
        "size_bytes": size_bytes,
        "available": availability.available if availability else False,
        "reason": availability.reason if availability else None,
        "sha256": sidecar.get("sha256") if sidecar else None,
        "build_epoch": sidecar.get("build_epoch") if sidecar else None,
        "database_type": sidecar.get("database_type") if sidecar else None,
    }


@router.post("/enrichers/geoip/database")
async def upload_geoip_database(
    file: UploadFile = File(...),  # noqa: B008
    admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """Upload (or replace) the MaxMind GeoLite2 database used by the GeoIP enricher.

    Validates the file opens as a real ``.mmdb`` *and* is a City-flavored
    database (``enrich_value`` calls ``.city()``, which a Country/ASN
    database would blow up on mid-job), then atomically replaces any previous
    database, records its identity in a metadata sidecar (hash + build epoch,
    the inputs to ``GeoIPEnricher.config_hash()``), and re-evaluates enricher
    availability so ``GET /api/enrichers`` reflects the change immediately.

    Replacing the database under a running system needs no reader
    invalidation: each job run opens its own reader on a fresh enricher
    instance (``Enricher.spawn()``), so new runs see the new file. A job
    already in flight keeps its old open file handle (safe on Linux — the
    inode lives until the handle closes) and its rows carry the *old*
    database's config hash captured at job start, so provenance stays
    accurate either way.
    """
    import shutil
    from datetime import UTC, datetime

    import geoip2.database

    from tracesignal.enrichers.geoip import geoip_database_path, write_geoip_sidecar
    from tracesignal.enrichers.registry import refresh_availability

    store = get_store()
    max_bytes = get_settings().max_upload_bytes or None
    tmp_path, sha256, _size = await receive_upload_to_tmp(file, max_bytes=max_bytes, suffix=".mmdb")

    class _WrongFlavorError(Exception):
        def __init__(self, database_type: str) -> None:
            super().__init__(database_type)
            self.database_type = database_type

    def _validate_and_install() -> dict[str, Any]:
        with geoip2.database.Reader(str(tmp_path)) as reader:
            meta = reader.metadata()
            if "City" not in meta.database_type:
                raise _WrongFlavorError(meta.database_type)
            sidecar = {
                "sha256": sha256,
                "build_epoch": meta.build_epoch,
                "database_type": meta.database_type,
                "uploaded_at": datetime.now(UTC).isoformat(),
            }
        target = geoip_database_path()
        target.parent.mkdir(parents=True, exist_ok=True)
        # tmp_path is under the system temp dir, which may be a different
        # filesystem than the target data dir — Path.replace() (os.rename)
        # fails cross-device, so use shutil.move (copy+unlink fallback).
        shutil.move(str(tmp_path), str(target))
        # Sidecar must exist before refresh_availability() returns, so a job
        # triggered right after this upload hashes against the new metadata.
        write_geoip_sidecar(target, sidecar)
        return sidecar

    try:
        sidecar = await asyncio.to_thread(_validate_and_install)
    except _WrongFlavorError as exc:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail=(
                f"Uploaded database is '{exc.database_type}', but the GeoIP enricher "
                "requires a City database (e.g. GeoLite2-City.mmdb). Download the City "
                "edition from MaxMind and upload that instead."
            ),
        ) from exc
    except Exception as exc:  # noqa: BLE001
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Invalid GeoLite2 database: {exc}") from exc

    availability_map = await asyncio.to_thread(refresh_availability)
    await store.record_audit(
        action="admin.geoip_database_upload",
        actor=admin,
        target_type="enricher",
        target_id="geoip",
        detail={
            "filename": file.filename,
            "sha256": sha256,
            "build_epoch": sidecar["build_epoch"],
            "database_type": sidecar["database_type"],
        },
    )
    availability = availability_map.get("geoip")
    return {
        "available": availability.available if availability else False,
        "reason": availability.reason if availability else None,
        "sha256": sha256,
        "build_epoch": sidecar["build_epoch"],
        "database_type": sidecar["database_type"],
    }
