---
title: Quick Start
description: Install ScholarMCP and run it in minutes.
sidebar:
  order: 2
---

## Prerequisites

- Node.js 22.14 or later, preferably Node.js 24 LTS
- npm

## Install

Global install:

```bash
npm install -g scholar-mcp
```

To update an existing installation to the 1.2 release:

```bash
npm install -g scholar-mcp@1.2.0
scholar-mcp --version
```

The expected version is `1.2.0`. Restart your MCP client after upgrading so it
loads the new server process.

### GitHub Packages mirror

The same release is available as `@lstudlo/scholar-mcp`. Configure the scope and
authenticate to GitHub Packages with a token that has `read:packages`:

```bash
npm config set @lstudlo:registry https://npm.pkg.github.com
npm login --scope=@lstudlo --registry=https://npm.pkg.github.com --auth-type=legacy
npm install -g @lstudlo/scholar-mcp@1.2.0
scholar-mcp --version
```

Both packages provide the `scholar-mcp` command. Install one distribution at a time.

One-off run without global install:

```bash
npx -y scholar-mcp --transport=stdio
```

## Run ScholarMCP

Start in `stdio` mode (recommended for MCP clients):

```bash
scholar-mcp --transport=stdio
```

Start in `http` mode:

```bash
scholar-mcp --transport=http
```

Check HTTP health endpoint:

```bash
curl http://127.0.0.1:3000/health
```

## Choose Your Client

After ScholarMCP is installed, connect it to your coding agent:

- Claude Code: [/getting-started/claude-code/](/getting-started/claude-code/)
- OpenAI Codex: [/getting-started/openai-codex/](/getting-started/openai-codex/)
- OpenCode: [/getting-started/opencode/](/getting-started/opencode/)

## First Useful Prompt

After attaching ScholarMCP to your MCP client:

> Find 10 recent papers on retrieval-augmented generation and summarize methods and datasets.
