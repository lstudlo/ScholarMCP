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
   - `test`
   - `Publish to GitHub Packages`

5. Verify:
   `npm view scholar-mcp version --registry https://registry.npmjs.org`
   The GitHub Packages workflow also verifies the exact scoped package version
   against `https://npm.pkg.github.com` using its `GITHUB_TOKEN`.
   Check GitHub release page for the new tag.

## Publishing setup

- npm uses trusted publishing from `.github/workflows/publish.yml`, with Node 24
  and npm 11. The npm package's trusted publisher must reference GitHub owner
  `lstudlo`, repository `ScholarMCP`, and workflow filename `publish.yml`.
- GitHub Packages uses the release workflow's `GITHUB_TOKEN` with
  `packages: write`, publishing from the package directory after applying the
  `@lstudlo` scope.
- The release script builds and checks the documentation before bumping the
  version, then verifies that generating docs after tagging leaves Git clean.
- A GitHub release alone does not prove publication. Both publish jobs and their
  registry verification steps must succeed.

## Commands To Use

- `pnpm release:check`
- `pnpm release [patch|minor|major]`

## Guardrails

1. Do not run `npm version` manually.
2. Do not create release tags manually.
3. If a release already created tag/release but publish failed, fix CI and cut a new patch release (`pnpm release`) instead of reusing the same tag/version.
