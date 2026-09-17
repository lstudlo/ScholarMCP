# ScholarMCP website

The Astro site builds static HTML and deploys to Cloudflare Pages at
https://scholar-mcp.lstudlo.com/. The package version is read from the MCP package.

## Build and verify

```sh
pnpm docs:build
pnpm --filter scholar-mcp-docs test
```

Build before running tests. The tests inspect rendered metadata, JSON-LD,
sitemap coverage, homepage content, links, fragments, and assets.

## Search discovery

- `src/content/docs/index.md` contains the product homepage and common questions.
  The splash template must render its Markdown body.
- `src/layouts/DocsLayout.astro` owns canonical URLs, social previews, crawler
  directives, and the public Google and Bing ownership-verification tags.
  Keep these tags to retain ownership verification.
- `src/lib/seo.ts` describes the site, publisher, software, pages, and breadcrumbs.
  Structured data must agree with visible content. Do not add invented ratings,
  reviews, or modification dates.
- `@astrojs/sitemap` creates `sitemap-index.xml` and its page sitemap at build time.
  `robots.txt` points crawlers to it. New published docs are included automatically.
- `404.astro` produces the top-level `404.html` required to disable Cloudflare
  Pages' SPA fallback. Unknown paths must return HTTP 404 after deployment.
- `llms.txt` is a generated documentation index for tools that support it. It is
  not required by Google and does not guarantee AI citations.
- `_headers` keeps data endpoints and the default pages.dev hostname out of
  search results. Cloudflare preview deployments have their own noindex header.
- `indexnow-key.txt` is an intentionally public ownership proof, not an account
  credential. The docs workflow waits for the matching production commit and
  then submits canonical sitemap URLs to IndexNow. It does not run for PRs.
  A 200 or 202 confirms receipt, not indexing. If deployment or submission fails,
  inspect the workflow log and rerun the job after fixing the reported problem.

Google Search Console and Bing Webmaster Tools use the canonical HTTPS URL-prefix
property. Submit `https://scholar-mcp.lstudlo.com/sitemap-index.xml` in each console.
Search Console is the source for Google impressions, clicks, queries, and indexing
status. New properties need time to collect reports. Cloudflare's existing Web
Analytics integration measures website visits separately.

Production builds receive `CF_PAGES_COMMIT_SHA`; Actions builds use `GITHUB_SHA`.
The resulting `scholarmcp-revision` meta tag lets deployment verification check
which commit is online. For a manual production build, set `CF_PAGES_COMMIT_SHA`
to the commit being deployed. Do not label uncommitted output as a clean release.
