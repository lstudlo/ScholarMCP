# ScholarMCP (Node.js + Hono)

A lightweight Google Scholar MCP server built with Node.js, Hono, and the official TypeScript MCP SDK.

This implementation ports the core ideas from the Python reference (`others-scolar-mcp`) and exposes them as production-ready MCP tools with:

- `stdio` transport for local MCP clients (including OpenAI Codex app)
- Streamable HTTP endpoint via Hono (`/mcp`) for remote/networked clients
- Keyword search, advanced search, and author-profile retrieval with graceful fallback behavior

## Features

- MCP-compliant tools:
  - `search_google_scholar_key_words`
  - `search_google_scholar_advanced`
  - `get_author_info`
- Hono-based HTTP runtime with security guards (host/origin validation and optional bearer auth)
- Resilient Google Scholar fetcher (timeouts, retries, request pacing)
- Structured outputs suitable for research automation flows
- Compatibility-oriented output shape inspired by the original Python server

## Architecture

- `src/config.ts`:
  - Environment parsing and runtime configuration
- `src/scholar/*`:
  - Google Scholar HTTP client, parsers, and service logic
- `src/mcp/*`:
  - MCP server/tool registration and stdio transport boot
- `src/http/*`:
  - Hono app and Streamable HTTP MCP endpoint
- `src/index.ts`:
  - Runtime entrypoint with transport mode selection

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Run in stdio mode (default, for MCP clients)

```bash
pnpm dev:stdio
```

### 3. Run in HTTP mode (Hono)

```bash
pnpm dev:http
```

Health endpoint:

```bash
curl http://127.0.0.1:3000/health
```

### 4. Build for production

```bash
pnpm build
pnpm start
```

## Configuration

Key environment variables:

- `SCHOLAR_MCP_TRANSPORT`: `stdio` | `http` | `both` (default: `stdio`)
- `SCHOLAR_MCP_HOST`: HTTP bind host (default: `127.0.0.1`)
- `SCHOLAR_MCP_PORT`: HTTP port (default: `3000`)
- `SCHOLAR_MCP_ENDPOINT_PATH`: MCP endpoint path (default: `/mcp`)
- `SCHOLAR_MCP_ALLOWED_ORIGINS`: CSV allowlist for Origin header checks
- `SCHOLAR_MCP_ALLOWED_HOSTS`: CSV allowlist for Host header checks
- `SCHOLAR_MCP_API_KEY`: Optional bearer token required for `/mcp`
- `SCHOLAR_LANGUAGE`: Scholar language (default: `en`)
- `SCHOLAR_TIMEOUT_MS`: Request timeout (default: `15000`)
- `SCHOLAR_RETRY_ATTEMPTS`: Retries (default: `2`)
- `SCHOLAR_REQUEST_DELAY_MS`: Delay between requests in ms (default: `250`)

Example:

```bash
SCHOLAR_MCP_TRANSPORT=http \
SCHOLAR_MCP_PORT=8787 \
SCHOLAR_MCP_API_KEY=change-me \
pnpm exec tsx src/index.ts
```

## MCP Tools

### `search_google_scholar_key_words`

Inputs:

- `query` (string, required)
- `num_results` (int, default `5`)
- `start` (int, default `0`)
- `language` (string, default `en`)

### `search_google_scholar_advanced`

Inputs:

- `query` (string, required)
- `author` (string, optional)
- `year_range` (`[start, end]` or `{start, end}`, optional)
- `exact_phrase` (string, optional)
- `exclude_words` (string, optional)
- `title_only` (boolean, default `false`)
- `num_results` (int, default `5`)
- `start` (int, default `0`)
- `language` (string, default `en`)

### `get_author_info`

Inputs:

- `author_name` (string, required)
- `max_publications` (int, default `5`)
- `language` (string, default `en`)

Notes:

- If Google Scholar rate-limits profile lookups, the server gracefully falls back to author-scoped paper search results.

## OpenAI Codex App Integration

Add an MCP server entry to `~/.codex/config.toml`.

### Option A: Local stdio (recommended)

```toml
[mcp_servers.scholar_mcp]
command = "pnpm"
args = ["--dir", "/absolute/path/to/ScolarMCP", "exec", "tsx", "src/index.ts", "--transport=stdio"]

[mcp_servers.scholar_mcp.env]
SCHOLAR_MCP_TRANSPORT = "stdio"
SCHOLAR_REQUEST_DELAY_MS = "350"
```

### Option B: HTTP endpoint

Run server:

```bash
SCHOLAR_MCP_TRANSPORT=http pnpm exec tsx src/index.ts
```

Then in Codex config:

```toml
[mcp_servers.scholar_mcp_http]
url = "http://127.0.0.1:3000/mcp"
```

If you enable `SCHOLAR_MCP_API_KEY`, include the auth mechanism your MCP client supports for bearer headers.

## Verification

Type check and tests:

```bash
pnpm check
pnpm test
```

## Legal and Usage Notes

Google Scholar may throttle or challenge automated traffic. Use conservative request pacing, respect usage terms, and avoid abusive query patterns.
