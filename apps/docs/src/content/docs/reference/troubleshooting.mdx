---
title: Troubleshooting
description: Common ScholarMCP setup and runtime issues.
sidebar:
  order: 4
---

## `claude mcp add` Fails with `Invalid environment variable format`

Cause: Claude CLI parsing usually means the separator before the launch command is missing or misplaced.

Fix:

- include `--` before the MCP launch command
- compare your command against [/getting-started/claude-code/](/getting-started/claude-code/)

## Agent Client Setup Fails

If ScholarMCP does not appear in your client, or the client stores incomplete MCP config, use the dedicated setup guides:

- Claude Code: [/getting-started/claude-code/](/getting-started/claude-code/)
- OpenAI Codex: [/getting-started/openai-codex/](/getting-started/openai-codex/)
- OpenCode: [/getting-started/opencode/](/getting-started/opencode/)
- Setup overview: [/getting-started/client-setup/](/getting-started/client-setup/)

## DOI Ingestion Fails to Resolve a PDF

Error pattern: unable to resolve downloadable PDF URL.

Fix options:

- provide `pdf_url` directly
- provide `local_pdf_path`
- verify DOI metadata or landing page exposes an accessible downloadable PDF

## Scholar Requests Are Being Throttled

Symptoms: intermittent empty results, repeated failures, or slow retries.

Fix options:

- increase `SCHOLAR_REQUEST_DELAY_MS` (for example `500` to `1000`)
- reduce request frequency in your prompts
- avoid bursty query patterns

## HTTP Clients Cannot Connect

Checklist:

- verify server is running in HTTP mode (`--transport=http` or env)
- verify endpoint URL matches `http://<host>:<port><endpointPath>`
- check `SCHOLAR_MCP_ALLOWED_HOSTS` and `SCHOLAR_MCP_ALLOWED_ORIGINS`
- if `SCHOLAR_MCP_API_KEY` is set, send `Authorization: Bearer <key>`

## Ingestion Fails for Local Files

Checklist:

- set `RESEARCH_ALLOW_LOCAL_PDFS=true`
- verify the file path exists and is readable by the process
- use absolute paths when possible
