# Release SOP

## Standard Flow

1. Ensure clean repo state:
   `git switch main && git pull --ff-only`
   `git status` must be clean.

2. Run preflight:
   `pnpm release:check`

3. Cut release:
   `pnpm release` (patch)
   or `pnpm release minor` / `pnpm release major`

4. Wait for GitHub Actions to finish:
   - `docs`
   - `Publish to npm`
   - `Publish to GitHub Packages`

5. Verify:
   `npm view scholar-mcp version`
   Check GitHub release page for the new tag.

## Commands To Use

- `pnpm release:check`
- `pnpm release [patch|minor|major]`

## Guardrails

1. Do not run `npm version` manually.
2. Do not create release tags manually.
3. If a release already created tag/release but publish failed, fix CI and cut a new patch release (`pnpm release`) instead of reusing the same tag/version.
