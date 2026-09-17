import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config.js';
import { Logger } from '../src/core/logger.js';
import { ResearchHttpClient } from '../src/research/http-client.js';
import { LiteratureService } from '../src/research/literature-service.js';
import { OpenAlexClient } from '../src/research/providers/openalex-client.js';

const config = () => parseConfig({ NODE_ENV: 'test', RESEARCH_OPENALEX_API_KEY: 'test-private-key',
  RESEARCH_RETRY_ATTEMPTS: 0, RESEARCH_REQUEST_DELAY_MS: 0, RESEARCH_GRAPH_CACHE_TTL_MS: 0 });
const rawWork = (id: string, title: string, doi?: string, author = 'Alice') => ({
  id, display_name: title, publication_year: 2024, ids: { doi },
  authorships: [{ author: { display_name: author } }]
});

describe('provider regressions', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('authenticates search and DOI lookup without exposing keys in provenance', async () => {
    const item = rawWork('W1', 'Paper', 'https://doi.org/10.1000/paper');
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ results: [item] }))
      .mockResolvedValueOnce(Response.json(item));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OpenAlexClient(config(), new ResearchHttpClient(config()));
    const results = await client.searchWorks('paper', 250);
    const exact = await client.getWorkByDoi('10.1000/paper');
    for (const [url, init] of fetchMock.mock.calls) {
      expect(new URL(url).searchParams.has('api_key')).toBe(false);
      expect(init.headers.authorization).toBe('Bearer test-private-key');
    }
    expect(new URL(fetchMock.mock.calls[0]![0]).searchParams.get('per-page')).toBe('100');
    expect(JSON.stringify([results, exact])).not.toContain('test-private-key');
  });

  it('does not substitute an unrelated ranked paper for a missing DOI', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => url.pathname.startsWith('/works/')
      ? new Response('', { status: 404 }) : Response.json({ results: [rawWork('W1', 'Unrelated', '10.1000/other')] })));
    const service = new LiteratureService(config(), new Logger('error'), {} as never);
    expect(await service.resolveByDoi('10.1000/missing')).toBeNull();
  });

  it('keeps conflicting DOIs and same-title works by different authors separate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: [
      rawWork('W1', 'Shared title', '10.1000/one'),
      rawWork('W2', 'Shared title', '10.1000/two'),
      rawWork('W3', 'Other title', undefined, 'Alice'),
      rawWork('W4', 'Other title', undefined, 'Bob'),
      rawWork('W5', '機器學習'),
      rawWork('W6', '量子計算')
    ] })));
    const service = new LiteratureService(config(), new Logger('error'), {} as never);
    const result = await service.searchGraph({ query: 'paper', limit: 10, sources: ['openalex'] });
    expect(result.results).toHaveLength(6);
    expect(result.results.map(work => work.doi)).toEqual(expect.arrayContaining(['10.1000/one', '10.1000/two']));
  });
});
