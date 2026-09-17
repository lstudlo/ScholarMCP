import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { load } from 'cheerio';

const output = fileURLToPath(new URL('../dist/', import.meta.url));
const origin = process.env.DOCS_SITE_URL ?? 'https://scholar-mcp.lstudlo.com';
const files = readdirSync(output, { recursive: true }).filter(file => file.endsWith('.html') && file !== '404.html');
const document = file => load(readFileSync(join(output, file), 'utf8'));
const pathFor = file => `/${file.replace(/index\.html$/, '')}`;

test('every built page has unique metadata, a canonical URL, and valid linked structured data', () => {
  assert.ok(files.length >= 17, 'build the complete documentation site before testing');
  const titles = new Set();
  const descriptions = new Set();
  for (const file of files) {
    const $ = document(file);
    const canonical = new URL(pathFor(file), origin).href;
    const title = $('title').text();
    const description = $('meta[name="description"]').attr('content');
    assert.equal($('h1').length, 1, file);
    assert.ok(title && description, `missing metadata: ${file}`);
    assert.ok(!titles.has(title), `duplicate title: ${file}`);
    assert.ok(!descriptions.has(description), `duplicate description: ${file}`);
    titles.add(title);
    descriptions.add(description);
    assert.equal($('link[rel="canonical"]').attr('href'), canonical, file);
    assert.doesNotMatch($('meta[name="robots"]').attr('content'), /noindex|nofollow/, file);
    assert.equal($('meta[property="og:url"]').attr('content'), canonical, file);
    assert.equal($('meta[property="og:title"]').attr('content'), title, file);
    assert.equal($('meta[property="og:description"]').attr('content'), description, file);
    assert.equal($('meta[name="twitter:card"]').attr('content'), 'summary_large_image');
    assert.ok(existsSync(join(output, new URL($('meta[property="og:image"]').attr('content')).pathname)), file);
    const graph = JSON.parse($('script[type="application/ld+json"]').text());
    assert.equal(graph['@context'], 'https://schema.org');
    assert.equal(graph['@graph'].find(item => item['@id'] === `${canonical}#page`).url, canonical);
    if (file !== 'index.html') {
      const crumbs = graph['@graph'].find(item => item['@type'] === 'BreadcrumbList').itemListElement;
      assert.equal(crumbs.at(-1).item, canonical, file);
      assert.equal(crumbs[0].item, new URL('/', origin).href, file);
    }
  }
});

test('the sitemap covers all canonical pages and excludes the error page and data endpoints', () => {
  const index = load(readFileSync(join(output, 'sitemap-index.xml'), 'utf8'), { xmlMode: true });
  const sitemapPaths = index('loc').toArray().map(item => new URL(index(item).text()));
  const urls = sitemapPaths.flatMap(url => {
    assert.equal(url.origin, new URL(origin).origin);
    const xml = load(readFileSync(join(output, url.pathname), 'utf8'), { xmlMode: true });
    return xml('url > loc').toArray().map(item => xml(item).text());
  });
  assert.deepEqual(urls.sort(), files.map(file => new URL(pathFor(file), origin).href).sort());
  const robots = readFileSync(join(output, 'robots.txt'), 'utf8');
  assert.match(robots, /^User-agent: \*\nAllow: \/\n/m);
  assert.ok(robots.includes(`Sitemap: ${new URL('/sitemap-index.xml', origin)}`));
  assert.doesNotMatch(robots, /<html|Disallow:\s*\//);
  const error = document('404.html');
  assert.match(error('meta[name="robots"]').attr('content'), /noindex/);
  assert.equal(error('link[rel="canonical"]').length, 0);
  assert.match(error('h1').text(), /not found/i);
});

test('the homepage renders product answers and setup links without JavaScript', () => {
  const $ = document('index.html');
  const text = $('main').text();
  for (const required of ['What is ScholarMCP?', 'OpenAlex', 'Crossref', 'Semantic Scholar', 'Google Scholar', 'Common questions', 'does not perform OCR', 'npx -y scholar-mcp --transport=stdio']) {
    assert.ok(text.includes(required), `missing server-rendered content: ${required}`);
  }
  assert.ok($('meta[name="google-site-verification"]').attr('content'));
  assert.ok($('meta[name="msvalidate.01"]').attr('content'));
  for (const client of ['claude-code', 'openai-codex', 'opencode']) {
    assert.ok($(`main a[href="/getting-started/${client}/"]`).length);
  }
  const llms = readFileSync(join(output, 'llms.txt'), 'utf8');
  assert.match(llms, /^# ScholarMCP/);
  for (const file of files) assert.ok(llms.includes(new URL(pathFor(file), origin).href), file);
});

test('internal links, fragments, and local assets resolve to built output', () => {
  for (const file of [...files, '404.html']) {
    const $ = document(file);
    for (const item of $('a[href], img[src], script[src], link[rel="stylesheet"][href]').toArray()) {
      const value = $(item).attr('href') ?? $(item).attr('src');
      const url = new URL(value, new URL(pathFor(file), origin));
      if (url.origin !== new URL(origin).origin) continue;
      const target = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
      assert.ok(existsSync(join(output, target)), `${file} has a missing target: ${value}`);
      if (url.hash && target.endsWith('.html')) {
        const linked = document(target);
        const id = decodeURIComponent(url.hash.slice(1));
        assert.ok(linked('[id]').toArray().some(element => linked(element).attr('id') === id), `${file} has a missing fragment: ${value}`);
      }
    }
  }
});
