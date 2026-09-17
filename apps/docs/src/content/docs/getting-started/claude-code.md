---
title: Claude Code
description: Connect ScholarMCP to Claude Code with the Claude CLI and manual fallback config.
sidebar:
  order: 3
---

This guide shows how to register ScholarMCP in Claude Code. Use the Claude CLI first, then fall back to manual config only if the CLI flow fails.

Official references:

- [Claude Code overview](https://docs.anthropic.com/en/docs/claude-code/overview)
- [Claude Code MCP](https://docs.anthropic.com/en/docs/claude-code/mcp)

Anthropic documents the CLI setup flow as `claude mcp add [options] <name> -- <command> [args...]`. The ScholarMCP examples below follow that pattern directly.

## What Claude Code Supports

- user-scoped MCP server registration with `claude mcp add`
- project-local fallback config with `.mcp.json`
- local `stdio` servers, which is the recommended ScholarMCP transport mode

## Install or Verify the Claude CLI

Install Claude Code if needed, then verify the MCP subcommand exists:

```bash
claude --version
claude mcp --help
```

## Add ScholarMCP with the Claude CLI

Using the published npm package:

```bash
claude mcp add -s user \
  --transport stdio \
  -e SCHOLAR_MCP_TRANSPORT=stdio \
  -e SCHOLAR_REQUEST_DELAY_MS=350 \
  -e RESEARCH_ALLOW_REMOTE_PDFS=true \
  -e RESEARCH_ALLOW_LOCAL_PDFS=true \
  scholar_mcp -- npx -y scholar-mcp --transport=stdio
```

Using a globally installed `scholar-mcp` binary:

```bash
claude mcp add -s user \
  --transport stdio \
  -e SCHOLAR_MCP_TRANSPORT=stdio \
  -e SCHOLAR_REQUEST_DELAY_MS=350 \
  -e RESEARCH_ALLOW_REMOTE_PDFS=true \
  -e RESEARCH_ALLOW_LOCAL_PDFS=true \
  scholar_mcp -- scholar-mcp --transport=stdio
```

Important: keep the `--` separator before the launch command. Claude's CLI uses that separator to stop parsing Claude flags and pass the rest to the MCP server command.

## Verify the Registration

Check the stored entry:

```bash
claude mcp get scholar_mcp
```

You should see a stdio server entry with the ScholarMCP command and the environment variables you passed at registration time.

## Manual Fallback If `claude mcp add` Fails

If the CLI rejects your arguments or writes incomplete config, add a user-scoped entry in `~/.claude.json`:

```json
{
  "mcpServers": {
    "scholar_mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "scholar-mcp", "--transport=stdio"],
      "env": {
        "SCHOLAR_MCP_TRANSPORT": "stdio",
        "SCHOLAR_REQUEST_DELAY_MS": "350",
        "RESEARCH_ALLOW_REMOTE_PDFS": "true",
        "RESEARCH_ALLOW_LOCAL_PDFS": "true"
      }
    }
  }
}
```

If you want the config to live only in the current repo, use the same `mcpServers` object in a project-local `.mcp.json` file instead of `~/.claude.json`.

After editing either file, restart Claude Code and run:

```bash
claude mcp list
```

If Claude still fails to load the server, check [/reference/troubleshooting/](/reference/troubleshooting/).

## Run from Repo Instead of npm

If you are developing ScholarMCP from source, run it from the repository root:

```bash
pnpm --filter scholar-mcp dev:stdio
```

Then point Claude Code at that repo-local command instead of `npx -y scholar-mcp --transport=stdio`.
