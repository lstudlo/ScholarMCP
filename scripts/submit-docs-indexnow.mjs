import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';

const site = new URL('https://scholar-mcp.lstudlo.com/');
const key = readFileSync(new URL('../apps/docs/public/indexnow-key.txt', import.meta.url), 'utf8').trim();
const keyLocation = new URL('/indexnow-key.txt', site).href;
const expectedRevision = process.env.EXPECTED_DOCS_REVISION;
assert.match(key, /^[a-f0-9]{32}$/);
assert.match(expectedRevision ?? '', /^[a-f0-9]{40}$/, 'EXPECTED_DOCS_REVISION must identify the deployed commit');

const fetchPage = (url) => fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'Cache-Control': 'no-cache' } });
let deployed = false;
const deadline = Date.now() + 15 * 60 * 1000;
// Cloudflare builds independently of Actions. Notify search engines only after
// this exact revision is served at the canonical production hostname.
for (let attempt = 0; Date.now() < deadline; attempt++) {
  try {
    // A fresh URL avoids a cached homepage response from an intermediate proxy
    // or edge while a deployment is propagating across regions.
    const probe = new URL(site);
    probe.searchParams.set('deployment-check', `${expectedRevision}-${attempt}`);
    const response = await fetchPage(probe);
    const html = await response.text();
    if (response.ok && html.includes(`name="scholarmcp-revision" content="${expectedRevision}"`)) {
      deployed = true;
      break;
    }
    if (attempt % 6 === 0) {
      const servedRevision = html.match(/name="scholarmcp-revision" content="([^"]+)"/)?.[1] ?? 'missing';
      console.log(`Production returned HTTP ${response.status}; revision ${servedRevision}; expected ${expectedRevision}.`);
    }
  } catch (error) {
    console.log(`Deployment check: ${error.message}`);
  }
  if (attempt % 6 === 0) console.log('Waiting for the Cloudflare production deployment...');
  await setTimeout(10000);
}
assert.ok(deployed, 'The expected revision was not deployed within 15 minutes. Inspect Cloudflare Pages and rerun this job.');
const ownership = await fetchPage(keyLocation);
assert.equal(ownership.status, 200, 'IndexNow ownership file is unavailable');
assert.equal((await ownership.text()).trim(), key, 'IndexNow ownership file differs from this checkout');

const index = await fetchPage(new URL('/sitemap-index.xml', site));
assert.equal(index.status, 200);
assert.match(index.headers.get('content-type') ?? '', /xml/);
const locations = xml => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
const urlList = [];
for (const sitemap of locations(await index.text())) {
  assert.equal(new URL(sitemap).origin, site.origin);
  const response = await fetchPage(sitemap);
  assert.equal(response.status, 200);
  urlList.push(...locations(await response.text()));
}
assert.ok(urlList.length > 0 && urlList.length <= 10000, 'Invalid sitemap URL count');
for (const url of urlList) assert.equal(new URL(url).origin, site.origin);

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: site.hostname, key, keyLocation, urlList }),
  signal: AbortSignal.timeout(30000)
});
assert.ok([200, 202].includes(response.status), `IndexNow returned ${response.status}: ${await response.text()}`);
console.log(`IndexNow accepted ${urlList.length} canonical URLs, HTTP ${response.status}. This confirms receipt, not indexing or ranking.`);
