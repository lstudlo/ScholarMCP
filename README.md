![ScholarMCP banner](public/scholarmcp_banner.png)

# ScholarMCP

[![npm](https://img.shields.io/npm/v/scholar-mcp)](https://www.npmjs.com/package/scholar-mcp)
[![test](https://github.com/lstudlo/ScholarMCP/actions/workflows/test.yml/badge.svg)](https://github.com/lstudlo/ScholarMCP/actions/workflows/test.yml)
[![latest commit](https://img.shields.io/github/last-commit/lstudlo/ScholarMCP)](https://github.com/lstudlo/ScholarMCP/commits/main)
[![license](https://img.shields.io/github/license/lstudlo/ScholarMCP)](https://github.com/lstudlo/ScholarMCP/blob/main/LICENSE)

ScholarMCP is an MCP server for literature research workflows in coding agents.
Official documentation: https://scholar-mcp.lstudlo.com/

### Early Development Notice

This project is still in early development, and rough edges or bugs may occur.
If you run into a problem, please open an issue and include:

1. the agent used
2. screenshots, if applicable
3. steps to reproduce the issue

### ScholarMCP gives your agent tools to:
- search papers across multiple sources
- ingest and parse full-text PDFs
- extract structured paper details
- suggest citations and build references
- validate manuscript citations

### ScholarMCP is for...

Use this if you want Claude Code, Codex, or any MCP-compatible coding agent to run research tasks directly from chat.

## Quick Start

### 1. Prerequisites

- Node.js `>=20`
- `npm` (for install/publish)
- `pnpm` (for contributors working from source)

### 2. Install as an npm package (recommended)

```bash
npm install -g scholar-mcp
```

One-off run without global install:

```bash
npx -y scholar-mcp --transport=stdio
```

Install from GitHub Packages (scoped mirror package):

```bash
npm install -g @lstudlo/scholar-mcp --registry=https://npm.pkg.github.com
```

### 3. Run

Stdio mode:

```bash
scholar-mcp --transport=stdio
```

HTTP mode:

```bash
scholar-mcp --transport=http
```

Health check (HTTP mode):

```bash
curl http://127.0.0.1:3000/health
```

### 4. Run from source (contributors)

```bash
pnpm install
pnpm dev:stdio
```

## Use with Coding Agents

ScholarMCP works best over `stdio` for local coding agents. The docs site has full step-by-step guides for [Claude Code](https://scholar-mcp.lstudlo.com/getting-started/claude-code/), [OpenAI Codex](https://scholar-mcp.lstudlo.com/getting-started/openai-codex/), and [OpenCode](https://scholar-mcp.lstudlo.com/getting-started/opencode/). Anthropic officially documents `claude mcp add ... -- <command>`, and OpenAI officially documents `codex mcp add ...`; the short forms below keep those CLI flows as the primary setup path.

Shared environment values used below:

```bash
SCHOLAR_MCP_TRANSPORT=stdio
SCHOLAR_REQUEST_DELAY_MS=350
RESEARCH_ALLOW_REMOTE_PDFS=true
RESEARCH_ALLOW_LOCAL_PDFS=true
```

### Claude Code

Add with the Claude CLI:

```bash
claude mcp add -s user \
  --transport stdio \
  -e SCHOLAR_MCP_TRANSPORT=stdio \
  -e SCHOLAR_REQUEST_DELAY_MS=350 \
  -e RESEARCH_ALLOW_REMOTE_PDFS=true \
  -e RESEARCH_ALLOW_LOCAL_PDFS=true \
  scholar_mcp -- npx -y scholar-mcp --transport=stdio
```

Verify:

```bash
claude mcp get scholar_mcp
```

Manual fallback:
- add `scholar_mcp` under `mcpServers` in `~/.claude.json`
- use project-local `.mcp.json` if you want the config scoped to the repo
- keep the `--` separator in the CLI form; Claude needs it to stop parsing flags

### OpenAI Codex

Add with the Codex CLI:

```bash
codex mcp add scholar_mcp \
  --env SCHOLAR_MCP_TRANSPORT=stdio \
  --env SCHOLAR_REQUEST_DELAY_MS=350 \
  --env RESEARCH_ALLOW_REMOTE_PDFS=true \
  --env RESEARCH_ALLOW_LOCAL_PDFS=true \
  -- npx -y scholar-mcp --transport=stdio
```

Verify:

```bash
codex mcp list
codex mcp get scholar_mcp --json
```

Manual fallback:
- add the server to `~/.codex/config.toml` under `[mcp_servers.scholar_mcp]`
- Codex CLI and the Codex app share that MCP config model

### OpenCode

Add with the OpenCode CLI:

```bash
opencode mcp add
```

Recommended interactive values:
- name: `scholar_mcp`
- type: `local`
- command: `npx -y scholar-mcp --transport=stdio`
- enabled: `true`
- env: use the four shared variables above

Verify:

```bash
opencode mcp list
```

Manual fallback:
- add the server to `~/.config/opencode/opencode.json`
- use `"type": "local"` and a command array like `["npx", "-y", "scholar-mcp", "--transport=stdio"]`

### Run from source

If you are developing ScholarMCP locally, use this launcher instead of `npx -y scholar-mcp --transport=stdio`:

```bash
pnpm --filter scholar-mcp dev:stdio
```

Use the same environment values shown above in whichever client you register.

### Generic MCP clients

- `stdio` command:
  - `scholar-mcp --transport=stdio`
  - Or: `npx -y scholar-mcp --transport=stdio`
- HTTP endpoint:
  1. Start server with `SCHOLAR_MCP_TRANSPORT=http scholar-mcp`
  2. Connect client to `http://127.0.0.1:3000/mcp`
  3. Optional auth: set `SCHOLAR_MCP_API_KEY` and send bearer auth header from your client

## MCP Tools

| Tool | Purpose |
|---|---|
| `search_literature_graph` | Federated search over OpenAlex/Crossref/Semantic Scholar (+ optional scholar scrape). |
| `search_google_scholar_key_words` | Keyword search on Google Scholar. |
| `search_google_scholar_advanced` | Scholar search with author/year/phrase filters. |
| `get_author_info` | Resolve author profile and top publications. |
| `ingest_paper_fulltext` | Start async full-text ingestion from DOI/URL/PDF/local path. |
| `get_ingestion_status` | Poll ingestion job status and parsed summary. |
| `extract_granular_paper_details` | Extract methods, claims, datasets, metrics, and references. |
| `suggest_contextual_citations` | Suggest citations from manuscript context. |
| `build_reference_list` | Generate formatted bibliography and BibTeX. |
| `validate_manuscript_citations` | Detect missing/uncited/duplicate citation issues. |

## Example Agent Prompts

- "Find 10 recent papers on retrieval-augmented generation and summarize methods and datasets."
- "Ingest full text for DOI `10.1038/s41467-024-55563-6`, then extract claims and limitations."
- "Given this draft section, suggest citations in IEEE style and generate BibTeX."
- "Validate my manuscript citations against this reference list and show missing citations."

## Configuration

Most users only need these:

- `SCHOLAR_MCP_TRANSPORT`: `stdio` | `http` | `both` (default: `stdio`)
- `SCHOLAR_REQUEST_DELAY_MS`: request pacing to reduce rate-limit risk (default: `250`)
- `RESEARCH_ALLOW_REMOTE_PDFS`: allow remote PDF downloads for ingestion (default: `true`)
- `RESEARCH_ALLOW_LOCAL_PDFS`: allow local PDF ingestion (default: `true`)
- `SCHOLAR_MCP_API_KEY`: optional bearer token for HTTP mode
- `RESEARCH_GROBID_URL`: optional GROBID endpoint

The CLI loads `.env` from the current working directory automatically at startup.

Advanced options exist in `src/config.ts` for timeouts, retries, HTTP session capacity/TTL, provider tuning, and cache behavior.

## Troubleshooting

- `Invalid environment variable format` in `claude mcp add`:
  - Add `--` before the MCP server name (see Claude setup command above).
- `Unable to resolve a downloadable PDF URL from input` on DOI ingestion:
  - The DOI and landing page may not expose an accessible PDF URL.
  - Retry with `pdf_url` (direct PDF) or `local_pdf_path`.
- Too many Scholar failures or throttling:
  - Increase `SCHOLAR_REQUEST_DELAY_MS` (for example `500` to `1000`).

## Usage Notes

Google Scholar may throttle automated traffic. Use conservative request pacing, respect provider terms, and avoid abusive query patterns.

## Publishing

Releases publish to two registries:

- npm: `scholar-mcp` via `.github/workflows/publish.yml`
- GitHub Packages: `@lstudlo/scholar-mcp` via `.github/workflows/publish-github-packages.yml`

Release with a minimal command set:

1. Validate release readiness:
   `pnpm release:check`
2. Cut and publish a release:
   `pnpm release` (patch), `pnpm release minor`, or `pnpm release major`
3. Start from a clean git working tree (no unstaged/staged/untracked files).
4. The release command runs checks, bumps `packages/scholar-mcp/package.json`, creates a release commit/tag, pushes branch/tag, then creates a GitHub Release.
5. GitHub Actions publishes to npm and GitHub Packages from that release tag.
