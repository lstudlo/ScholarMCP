import type { APIRoute } from 'astro';
import { getDocsPages } from '../lib/docs';
import { productDescription, repositoryUrl, packageUrl } from '../lib/seo';

// A documentation index for tools that support llms.txt. Search indexing uses
// the HTML pages and XML sitemap; this file is not a search-engine requirement.
export const GET: APIRoute = async ({ site }) => {
  const pages = await getDocsPages();
  const text = [
    '# ScholarMCP', '', `> ${productDescription}`, '',
    'ScholarMCP runs locally over stdio or on a trusted HTTP server. It searches OpenAlex, Crossref, Semantic Scholar, and Google Scholar, ingests accessible PDFs, and supports bibliography workflows.', '',
    'Extraction uses text patterns. Citation validation checks consistency, not whether a source supports a claim. OCR and cloud LLM extraction are not implemented. Provider access and rate limits apply.', '',
    '## Documentation', '',
    ...pages.map((page) => `- [${page.label}](${new URL(page.href, site)}): ${page.entry.data.description ?? page.label}`), '',
    '## Project', '', `- [Source code and issues](${repositoryUrl})`,
    `- [npm package](${packageUrl})`, ''
  ].join('\n');
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
