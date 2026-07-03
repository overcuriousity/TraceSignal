## Summary

<!-- What changes, and why. Link the issue if one exists. -->

## Test plan

<!-- Commands run, manual verification steps. -->

- [ ] `uv run pytest` passes
- [ ] `uv run ruff check .` / `uv run ruff format .` clean
- [ ] `npm run typecheck` / `npm run lint` / `npm run test` clean (if frontend touched)
- [ ] Manually exercised the affected flow in the running app

## Forensic/reproducibility impact

<!-- Does this change a hashed config (ParserConfig, EmbeddingConfig), event schema,
     or anything that affects reproducibility of past results? If yes, explain. -->
