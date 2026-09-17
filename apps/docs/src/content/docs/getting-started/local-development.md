---
title: Local Development
description: Run ScholarMCP from source and verify changes.
sidebar:
  order: 7
---

## Prerequisites

- Node.js 24 LTS, or Node.js 22.14 or later
- pnpm 10

## Setup

```bash
pnpm install --frozen-lockfile
```

## Run from Source

Stdio mode:

```bash
pnpm dev:stdio
```

HTTP mode:

```bash
pnpm dev:http
```

## Verify

Type check package:

```bash
pnpm check
```

Run tests:

```bash
pnpm test
```

Build the docs and check generated content:

```bash
node --test scripts/generate-docs-*.test.mjs
pnpm docs:build
pnpm --filter scholar-mcp-docs test
git diff -- apps/docs/src/content/docs/reference/mcp-tools.md apps/docs/src/content/docs/releases/index.md
```

Commit generated changes with the source changes that caused them. The docs CI
job rejects stale generated content. Run `pnpm release:check` before releasing to
also check the package build and tarball contents.
