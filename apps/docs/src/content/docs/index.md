---
title: ScholarMCP
seoTitle: ScholarMCP | Academic Research MCP Server
description: Search academic papers across Google Scholar, OpenAlex, Crossref, and Semantic Scholar. Parse PDFs and build citations in Claude Code, Codex, and OpenCode.
template: splash
hero:
  title: ScholarMCP, an MCP server for academic research
  tagline: Give your AI assistant tools to search academic papers, read accessible PDFs, and build references. Connect ScholarMCP to Claude Code, Codex, OpenCode, or another MCP client.
  actions:
    - text: Install ScholarMCP
      link: /getting-started/quick-start/
    - text: View source on GitHub
      link: https://github.com/lstudlo/ScholarMCP
      variant: minimal
---

## What is ScholarMCP?

ScholarMCP is a free, open-source **Model Context Protocol server for literature research**. It connects an MCP-compatible assistant to academic search, PDF parsing, and citation tools. You run it on your own computer or a trusted server, and your assistant calls its tools from your conversation.

Use it to shortlist papers for a literature review, inspect methods in accessible full text, or prepare a bibliography. ScholarMCP provides ten tools for these steps. See the [complete MCP tool reference](/reference/mcp-tools/) for their inputs and outputs.

## Search beyond a single paper database

Search **OpenAlex, Crossref, and Semantic Scholar** together with `search_literature_graph`. ScholarMCP combines results and deduplicates matching papers. You can choose sources and filter by publication year.

For **Google Scholar**, use the dedicated keyword search, advanced search, and author-profile tools. Google Scholar scraping is also an optional source for federated searches. Availability depends on each provider's access rules and rate limits. Google Scholar may throttle or block automated requests.

The [academic paper search guide](/guides/academic-paper-search/) explains when to use each tool and how to handle incomplete results.

## Install and connect your assistant

Use Node.js 22.14 or later. Your MCP client can launch ScholarMCP with this command:

```bash
npx -y scholar-mcp --transport=stdio
```

Register it in your client before asking the assistant to use its tools. Follow the setup guide for [Claude Code](/getting-started/claude-code/), [OpenAI Codex](/getting-started/openai-codex/), or [OpenCode](/getting-started/opencode/). The [generic client guide](/getting-started/client-setup/) covers other MCP-compatible clients.

You can also install the [npm package](https://www.npmjs.com/package/scholar-mcp) globally. The [installation guide](/getting-started/quick-start/) includes the GitHub Packages mirror and upgrade instructions. Read the [release notes](/releases/) for changes in version 1.2.

## Try a literature review workflow

After connecting ScholarMCP, ask your assistant:

> Find papers published from 2022 to 2026 about retrieval-augmented generation evaluation. Search OpenAlex, Crossref, and Semantic Scholar. Return titles, publication years, DOIs, and source links, and report any provider failures.

Then work through the papers you choose:

1. **Read accessible full text.** Ingest a direct PDF, a local PDF, or a DOI with a downloadable PDF. Wait for the ingestion job to finish.
2. **Inspect the extracted text.** Request methods, datasets, metrics, claims, and references. Check the results against the paper.
3. **Prepare references.** Build a formatted bibliography or BibTeX, then check the draft for supported citation-consistency issues.

Follow the [research workflow examples](/guides/research-workflows/) or the [PDF ingestion guide](/guides/fulltext-ingestion/) for exact steps and limitations.

## Common questions

### Is ScholarMCP free?

ScholarMCP is MIT-licensed software, with no ScholarMCP subscription. Your AI assistant, external data providers, or hosting may have separate costs and access requirements. The [source code](https://github.com/lstudlo/ScholarMCP) is public.

### Does ScholarMCP need an API key?

The server itself does not require a paid ScholarMCP key. Provider authentication is separate. You can configure OpenAlex and Semantic Scholar API keys, and a contact email for provider requests. Provider access policies and quotas may change. See the [configuration reference](/reference/configuration/).

### Can ScholarMCP read any PDF or bypass a paywall?

It reads accessible PDFs and local files permitted by your configuration. It does not bypass paywalls, and some DOIs do not resolve to a downloadable PDF. Scanned documents need OCR before ingestion because ScholarMCP does not perform OCR.

### Does it verify that a citation supports a claim?

No. Citation validation checks supported citation patterns for consistency, including missing, uncited, and duplicate references. It does not establish whether a source supports your claim. Extraction uses text patterns, so review the original paper and the proposed references.

### Where does the research data go?

ScholarMCP runs locally by default, but search queries go to the selected providers and remote PDFs are downloaded from their hosts. If you configure GROBID, it receives PDFs for parsing. Parsed documents and ingestion jobs remain in process memory until the server restarts. Your MCP client may pass tool results to its AI provider.

### How do I report a problem or contribute?

Open an [issue on GitHub](https://github.com/lstudlo/ScholarMCP/issues) with your client, ScholarMCP version, and reproduction steps. The [local development guide](/getting-started/local-development/) explains how to run and test the project.
