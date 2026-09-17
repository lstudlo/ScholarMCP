---
title: Academic Paper Search
seoTitle: Search Google Scholar, OpenAlex and Semantic Scholar | ScholarMCP
description: Choose ScholarMCP search tools, combine academic databases, filter by publication year, and identify partial results before a literature review.
sidebar:
  order: 3
---

ScholarMCP provides federated academic search and dedicated Google Scholar tools. Use federated search to compare metadata from several providers. Use the Scholar tools when you need Google Scholar's keyword results, author profiles, or advanced filters.

## Which search tool should I use?

| Research task | Tool | Sources |
| --- | --- | --- |
| Search several databases and combine results | `search_literature_graph` | OpenAlex, Crossref, Semantic Scholar; optional Google Scholar scraping |
| Search Google Scholar by keywords | `search_google_scholar_key_words` | Google Scholar |
| Apply Scholar author, year, or phrase filters | `search_google_scholar_advanced` | Google Scholar |
| Inspect an author's profile and publications | `get_author_info` | Google Scholar |

The [tool reference](/reference/mcp-tools/) lists the exact schema for each tool. ScholarMCP is an independent open-source project and is not an official product of these providers.

## Search several academic databases

Ask your connected assistant:

> Search OpenAlex, Crossref, and Semantic Scholar for retrieval-augmented generation evaluation papers from 2022 to 2026. Give me titles, years, DOIs, and source links. Show provider errors separately.

A `search_literature_graph` request can include:

```json
{
  "query": "retrieval-augmented generation evaluation",
  "year_range": { "start": 2022, "end": 2026 },
  "limit": 15
}
```

The year range is an object with `start` and `end`, not an array. Use the tool's `sources` option when you want to select providers explicitly.

ScholarMCP combines provider results and deduplicates matching records. Metadata, coverage, and citation counts can differ between databases. Follow the DOI or source link when a detail matters to your review.

## Check whether results are complete

Inspect `providerErrors` in the federated response. A response containing papers can still be incomplete if another provider failed or throttled the request. Report those gaps before drawing conclusions about the available literature.

Configure provider keys and contact details in the [environment reference](/reference/configuration/). Keep requests conservative, and use the [troubleshooting guide](/reference/troubleshooting/) when providers reject requests.

## Use Google Scholar deliberately

Google Scholar tools retrieve Scholar pages. Automated requests can encounter throttling or challenges, so a failed search does not mean that no papers exist. Increase request pacing where appropriate and respect the provider's terms.

When Scholar is unavailable, you can continue with the API-based providers. Their coverage and ranking differ from Google Scholar, so describe that change in your research notes.

## Move from a result to full text

Finding a paper's metadata does not guarantee access to its full text. Choose an accessible PDF or a local file you are permitted to read, then follow the [full-text ingestion guide](/guides/fulltext-ingestion/). ScholarMCP does not bypass access controls or paywalls.

After ingestion, use the [research workflows](/guides/research-workflows/) to extract details and prepare references. Review the original source before relying on extracted claims or suggested citations.
