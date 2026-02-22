# ScholarMCP Monorepo

This repository contains the ScholarMCP runtime, documentation site, and Python parsing sidecar.

## Repository Layout

- `packages/scholar-mcp`: publishable npm package (`scholar-mcp`)
- `apps/docs`: Astro + Starlight documentation site
- `services/python-sidecar`: optional Python sidecar service for fallback parsing
- `scripts`: repository-level automation (docs generation, release metadata generation)

## Workspace Commands (from repo root)

```bash
pnpm install

# MCP package
pnpm dev:stdio
pnpm check
pnpm test
pnpm build

# Docs site
pnpm docs:dev
pnpm docs:check
pnpm docs:build
pnpm docs:sync
```

## Package Details

For package usage, transports, MCP tool descriptions, and publishing workflow, see:

- `packages/scholar-mcp/README.md`

## Cloudflare Pages Docs Deploy

Recommended settings:

- Root directory: repository root
- Build command: `pnpm install --frozen-lockfile && pnpm --filter @scholar-mcp/docs build`
- Build output directory: `apps/docs/dist`
- Production branch: `main`

Recommended build watch paths:

- `apps/docs/**`
- `packages/scholar-mcp/src/**`
- `packages/scholar-mcp/package.json`
- `scripts/**`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
