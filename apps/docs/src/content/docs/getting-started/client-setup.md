---
title: Client Setup Overview
description: Pick a supported agent client and connect ScholarMCP with a CLI-first setup flow.
sidebar:
  order: 6
---

ScholarMCP currently documents three MCP-capable coding clients in detail:

- [Claude Code](/getting-started/claude-code/)
- [OpenAI Codex](/getting-started/openai-codex/)
- [OpenCode](/getting-started/opencode/)

## Recommended Setup Path

For all three clients, use this order:

1. Install or verify the client CLI.
2. Register ScholarMCP with the client's MCP command.
3. Confirm the server appears in the client's MCP list or detail view.
4. Fall back to manual config only if the CLI registration fails or writes bad config.

## When Manual Config Is Needed

Use the manual configuration section on the client-specific page if:

- the client has no stable non-interactive `mcp add` flow
- the CLI rejects your environment variables or command arguments
- the registration succeeds, but the stored config is incomplete or points at the wrong command

If CLI registration succeeds but ScholarMCP still does not start correctly, verify:

- the stored command still points to an installed `scholar-mcp` launcher
- the MCP server is running in `stdio` mode
- the environment variables are attached to the same server entry
- your client can still see the `scholar_mcp` server after restart

## Choose Your Client

- Claude Code: [/getting-started/claude-code/](/getting-started/claude-code/)
- OpenAI Codex: [/getting-started/openai-codex/](/getting-started/openai-codex/)
- OpenCode: [/getting-started/opencode/](/getting-started/opencode/)

For general server runtime details, see [/reference/configuration/](/reference/configuration/) and [/reference/cli/](/reference/cli/). For common setup failures, see [/reference/troubleshooting/](/reference/troubleshooting/).
