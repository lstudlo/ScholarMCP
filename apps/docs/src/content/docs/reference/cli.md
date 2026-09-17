---
title: CLI Reference
description: Command-line interface for running ScholarMCP.
sidebar:
  order: 1
---

## Usage

```bash
scholar-mcp [--transport <stdio|http|both>]
scholar-mcp --help
scholar-mcp --version
```

## Options

- `--transport <mode>`: overrides `SCHOLAR_MCP_TRANSPORT` for the current run
- `-h, --help`: print help text
- `-v, --version`: print installed package version

## Examples

Stdio mode:

```bash
scholar-mcp --transport=stdio
```

HTTP mode:

```bash
scholar-mcp --transport=http
```

Both transports:

```bash
scholar-mcp --transport=both
```
