# Release SOP

## Standard Flow

1. Ensure clean repo state:
   `git switch main && git pull --ff-only`
   `git status` must be clean.

2. Run preflight:
   `pnpm release:check`

3. Prepare release notes with contributor credits first. Verify authors against
   merged pull requests, explicitly `@mention` each contributor in GitHub
   release notes, and link their PRs with a short description of their work.
   Keep the website's release notes aligned, using profile links for handles.
   Use a warm community voice, direct thank-yous, and a few cheerful emojis.
   Explain what users gain from the release before listing implementation
   details. Keep upgrade instructions, validation, and limitations accurate.

4. Cut release:
   `pnpm release` (patch)
   or `pnpm release minor` / `pnpm release major`

5. Wait for GitHub Actions to finish:
   - `docs`
   - `Publish to npm`
   - `test`
   - `Publish to GitHub Packages`

6. Verify:
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
- npm can accept a release while it is still processing. Verification retries
  this delay. If processing exceeds the retry window, rerun verification only
  with `gh workflow run publish.yml --ref <release-tag>`; this dispatch never
  publishes. The selected ref must contain the dispatch-enabled workflow.

## Commands To Use

- `pnpm release:check`
- `pnpm release [patch|minor|major]`

## Guardrails

1. Do not run `npm version` manually.
2. Do not create release tags manually.
3. If publishing itself failed after creating a tag/release, fix CI and cut a new patch release (`pnpm release`) instead of reusing the same tag/version. If npm accepted the package and only the availability check failed, verify the existing version without republishing it.
