"""TraceSignal command-line interface."""

from __future__ import annotations

import asyncio
from pathlib import Path

import typer

from tracesignal import __version__
from tracesignal.cli.progress import BytesProgressPrinter
from tracesignal.db.postgres import Case, PostgresStore, User, generate_id
from tracesignal.ingestion.files import hash_file
from tracesignal.ingestion.pipeline import EmbeddingPipeline, IngestionPipeline

app = typer.Typer(
    name="tsig",
    help="TraceSignal — local-first forensic log investigation.",
    no_args_is_help=True,
)

cases_app = typer.Typer(help="Inspect cases (admin/CLI use — unscoped, no RBAC gate).")
app.add_typer(cases_app, name="cases")


def _get_store() -> PostgresStore:
    """Return a PostgresStore instance for CLI operations."""
    return PostgresStore()


@app.command()
def version() -> None:
    """Print the TraceSignal version."""
    typer.echo(__version__)


@cases_app.command("list")
def cases_list() -> None:
    """List every case with its owner, team, and source count.

    Unscoped — the CLI runs on a trusted admin host (see README), so this
    intentionally bypasses the web UI's per-user RBAC filtering the same way
    ``PostgresStore.list_cases()`` documents itself as "admin/CLI use only".
    """
    store = _get_store()

    async def _run() -> None:
        await store.init_schema()
        cases = await store.list_cases()
        users = {u.id: u for u in await store.list_users()}
        teams = {t.id: t for t in await store.list_teams()}

        if not cases:
            typer.echo("No cases found.")
            return

        rows = []
        for case in cases:
            owner = users.get(case.owner_id or "")
            team = teams.get(case.team_id or "")
            sources = await store.list_sources(case.id)
            rows.append(
                (
                    case.id,
                    case.name,
                    owner.username if owner else "—",
                    team.name if team else "— (personal)",
                    str(len(sources)),
                )
            )

        headers = ("CASE ID", "NAME", "OWNER", "TEAM", "SOURCES")
        widths = [max(len(h), *(len(r[i]) for r in rows)) for i, h in enumerate(headers)]
        typer.echo("  ".join(h.ljust(w) for h, w in zip(headers, widths, strict=True)))
        typer.echo("  ".join("-" * w for w in widths))
        for row in rows:
            typer.echo("  ".join(c.ljust(w) for c, w in zip(row, widths, strict=True)))

    asyncio.run(_run())


async def _resolve_ingest_user(store: PostgresStore, username: str | None) -> User:
    """Resolve and validate the user to attribute a CLI ingest to.

    If ``username`` is given, it must name an active user. Otherwise, exactly
    one active admin must exist on the system to default to — anything else
    (zero or multiple admins) requires an explicit ``--user``, since guessing
    provenance wrong would corrupt the forensic chain-of-custody record.
    """
    if username is not None:
        user = await store.get_user_by_username(username)
        if user is None or not user.is_active:
            typer.echo(f"ERROR: No active user named '{username}'.", err=True)
            raise typer.Exit(code=1)
        return user

    admins = [u for u in await store.list_users() if u.is_admin and u.is_active]
    if len(admins) == 1:
        return admins[0]
    typer.echo(
        f"ERROR: --user required (found {len(admins)} active admins; "
        "cannot default unambiguously).",
        err=True,
    )
    raise typer.Exit(code=1)


@app.command()
def ingest(
    path: str = typer.Argument(..., help="Path to log file or directory to ingest."),
    case: str = typer.Option(..., "--case", "-c", help="Target case ID (see 'tsig cases list')."),
    source: str = typer.Option(..., "--source", "-s", help="Source name."),
    format: str | None = typer.Option(
        None,
        "--format",
        "-f",
        help="Parser format (timesketch_csv, jsonl). Inferred from extension if omitted.",
    ),
    batch_size: int | None = typer.Option(
        None,
        "--batch-size",
        "-b",
        help="Number of events to insert per batch (default: TS_INGEST_BATCH_SIZE).",
    ),
    user: str | None = typer.Option(
        None,
        "--user",
        "-u",
        help="Username to attribute this ingest to (default: the sole active admin, if unambiguous).",
    ),
) -> None:
    """Ingest a source file into TraceSignal (no embeddings)."""
    path_obj = Path(path).resolve()
    if not path_obj.exists():
        typer.echo(f"ERROR: Path not found: {path}", err=True)
        raise typer.Exit(code=1)

    store = _get_store()

    async def _prepare() -> tuple[User, Case]:
        await store.init_schema()
        resolved_user = await _resolve_ingest_user(store, user)
        case_obj = await store.get_case(case)
        if case_obj is None:
            typer.echo(
                f"ERROR: No case with id '{case}'. Run 'tsig cases list' to see valid IDs.",
                err=True,
            )
            raise typer.Exit(code=1)
        return resolved_user, case_obj

    resolved_user, case_obj = asyncio.run(_prepare())

    file_hash = hash_file(path_obj)
    source_id = generate_id(f"{case_obj.id}:{source}:{file_hash}")

    total_size = (
        path_obj.stat().st_size
        if path_obj.is_file()
        else sum(p.stat().st_size for p in path_obj.rglob("*") if p.is_file())
    )
    typer.echo(
        f"Ingesting {path_obj.name} ({total_size / 1e6:,.1f} MB) "
        f"into case '{case_obj.name}' [{case_obj.id}] as user '{resolved_user.username}'"
    )
    printer = BytesProgressPrinter()

    pipeline = IngestionPipeline(
        case_id=case_obj.id,
        source_id=source_id,
        batch_size=batch_size,
        file_hash=file_hash,
        source_name=source,
        progress_callback=printer.on_progress,
    )
    result = pipeline.run(path_obj, format_name=format)
    typer.echo(result.summary())

    async def _persist() -> None:
        await store.create_source(
            case_id=case_obj.id,
            source_id=source_id,
            name=source,
            file_hash=file_hash,
            size_bytes=path_obj.stat().st_size,
            filename=path_obj.name,
            parser=format or "auto",
            event_count=result.events_inserted,
            created_by=resolved_user.username,
        )
        default_timeline = await store.get_default_timeline(case_obj.id)
        if default_timeline is not None:
            await store.add_source_to_timeline(case_obj.id, default_timeline.id, source_id)
        await store.record_audit(
            action="cli.ingest.source",
            actor=resolved_user,
            case_id=case_obj.id,
            target_type="source",
            target_id=source_id,
            detail={
                "events_inserted": result.events_inserted,
                "events_parsed": result.events_parsed,
                "file_hash": file_hash,
                "filename": path_obj.name,
                "via": "cli",
            },
        )

    asyncio.run(_persist())

    if result.errors:
        for error in result.errors:
            typer.echo(f"ERROR: {error}", err=True)
        raise typer.Exit(code=1)


@app.command()
def embed(
    case: str = typer.Option(..., "--case", "-c", help="Target case ID (see 'tsig cases list')."),
    source: str = typer.Option(..., "--source", "-s", help="Source name or ID."),
    batch_size: int = typer.Option(
        64,
        "--batch-size",
        "-b",
        help="Number of events to embed per batch.",
    ),
) -> None:
    """Generate embeddings for an already-ingested source."""
    store = _get_store()

    async def _check_case() -> None:
        await store.init_schema()
        case_obj = await store.get_case(case)
        if case_obj is None:
            typer.echo(
                f"ERROR: No case with id '{case}'. Run 'tsig cases list' to see valid IDs.",
                err=True,
            )
            raise typer.Exit(code=1)

    asyncio.run(_check_case())

    pipeline = EmbeddingPipeline(
        case_id=case,
        source_ids=[source],
        batch_size=batch_size,
    )
    result = pipeline.run()
    typer.echo(result.summary())

    # Update vector count on the source record.
    async def _update() -> None:
        await store.update_source_counts(
            case_id=case,
            source_id=source,
            vector_count=result.vectors_inserted,
        )

    asyncio.run(_update())

    if result.errors:
        for error in result.errors:
            typer.echo(f"ERROR: {error}", err=True)
        raise typer.Exit(code=1)


if __name__ == "__main__":
    app()
