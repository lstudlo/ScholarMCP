---
title: Full-Text Ingestion
description: Configure and troubleshoot full-text ingestion for ScholarMCP.
sidebar:
  order: 2
---

## Input Priority

`ingest_paper_fulltext` accepts any of:

- `doi`
- `paper_url`
- `pdf_url`
- `local_pdf_path`

You must pass at least one.

Local files take priority. Otherwise, ScholarMCP uses `pdf_url`, an OpenAlex PDF
link resolved from `doi`, a `paper_url` whose path ends in `.pdf`, then PDF links
discovered on the landing page. Direct PDF links skip landing-page discovery.
An unresolved DOI does not substitute a different paper.

## Parse Modes

- `auto` (default): tries parser fallback chain
- `grobid`: tries GROBID first, then falls back to the simple parser
- `simple`: uses only the local `pdf-parse` parser

In `auto` mode, ScholarMCP now attempts `grobid -> simple`.

Set `RESEARCH_GROBID_URL` to use GROBID. It receives the PDF file for parsing.
Without it, ScholarMCP uses `pdf-parse` locally. `ocr_enabled` is reserved;
neither mode currently performs OCR. Image-only scanned PDFs need OCR before
ingestion.

## Limits and job lifetime

- PDF files and GROBID responses are limited to 50 MiB; landing pages to 2 MiB.
- Downloads, landing-page discovery, and GROBID calls use `RESEARCH_TIMEOUT_MS`,
  which defaults to 20 seconds per request.
- Jobs and parsed documents live in process memory. Poll until `succeeded` or
  `failed`, and extract or save results before restarting the server.
- Extraction uses local text patterns. Tables, equations, and figures are not
  extracted, and no cloud LLM is called.

Use HTTP mode only with trusted clients. Local file access and remote URL
fetching use the server's permissions and network access. For remote hosting,
configure a bearer API key, host/origin allow-lists, and network isolation;
disable local PDF ingestion if clients should not read server files.

## Common Failure Cases

- DOI page has no downloadable PDF URL:
  - retry with `pdf_url` or `local_pdf_path`
- Remote downloads disabled:
  - set `RESEARCH_ALLOW_REMOTE_PDFS=true`
- Local ingestion disabled:
  - set `RESEARCH_ALLOW_LOCAL_PDFS=true`
- Throttling or timeout pressure:
  - increase `SCHOLAR_REQUEST_DELAY_MS` and/or `RESEARCH_TIMEOUT_MS`
