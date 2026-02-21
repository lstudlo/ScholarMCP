import { describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config.js';
import { Logger } from '../src/core/logger.js';
import { LiteratureService } from '../src/research/literature-service.js';
import type { ProviderWork } from '../src/research/providers/openalex-client.js';

const makeWork = (overrides: Partial<ProviderWork>): ProviderWork => ({
  provider: 'openalex',
  providerId: 'openalex:1',
  title: 'Graph Neural Networks for Scientific Retrieval',
  abstract: 'A retrieval approach for scientific corpora.',
  year: 2023,
  venue: 'TestConf',
  doi: null,
  url: 'https://example.org/paper-1',
  citationCount: 100,
  influentialCitationCount: 10,
  referenceCount: 40,
  authors: [{ name: 'Alice Smith', authorId: 'A1' }],
  openAccess: {
    isOpenAccess: true,
    pdfUrl: 'https://example.org/paper-1.pdf',
    license: 'cc-by'
  },
  externalIds: {},
  fieldsOfStudy: ['Computer Science'],
  score: 0.9,
  sourceUrl: 'https://provider.example.org',
  ...overrides
});

describe('literature-service', () => {
  it('applies provider fanout, fuzzy dedupe, and cache reuse', async () => {
    const config = parseConfig({
      NODE_ENV: 'test',
      RESEARCH_GRAPH_CACHE_TTL_MS: 60_000,
      RESEARCH_GRAPH_PROVIDER_RESULT_MULTIPLIER: 2,
      RESEARCH_GRAPH_FUZZY_TITLE_THRESHOLD: 0.8
    });

    const service = new LiteratureService(config, new Logger('error'), {} as never);

    const openAlexSearch = vi.fn(async (_query: string, _limit: number) => [
      makeWork({
        provider: 'openalex',
        providerId: 'openalex:1'
      })
    ]);

    const crossrefSearch = vi.fn(async (_query: string, _limit: number) => [
      makeWork({
        provider: 'crossref',
        providerId: 'crossref:1',
        title: 'Graph Neural Networks for Scientific Retrieval.',
        year: 2024,
        score: 0.7
      })
    ]);

    const semanticSearch = vi.fn(async (_query: string, _limit: number) => [
      makeWork({
        provider: 'semantic_scholar',
        providerId: 'semantic:1',
        title: 'Transformer Baselines for Retrieval',
        year: 2022,
        authors: [{ name: 'Bob Lee', authorId: 'B1' }],
        citationCount: 20,
        score: 0.6
      })
    ]);

    (service as unknown as { openAlexClient: { searchWorks: typeof openAlexSearch } }).openAlexClient = {
      searchWorks: openAlexSearch
    };
    (service as unknown as { crossrefClient: { searchWorks: typeof crossrefSearch } }).crossrefClient = {
      searchWorks: crossrefSearch
    };
    (service as unknown as { semanticScholarClient: { searchWorks: typeof semanticSearch } }).semanticScholarClient = {
      searchWorks: semanticSearch
    };

    const first = await service.searchGraph({
      query: 'scientific retrieval',
      limit: 2
    });

    const second = await service.searchGraph({
      query: 'scientific retrieval',
      limit: 2
    });

    expect(openAlexSearch).toHaveBeenCalledWith('scientific retrieval', 4);
    expect(crossrefSearch).toHaveBeenCalledWith('scientific retrieval', 4);
    expect(semanticSearch).toHaveBeenCalledWith('scientific retrieval', 4);

    expect(openAlexSearch).toHaveBeenCalledTimes(1);
    expect(crossrefSearch).toHaveBeenCalledTimes(1);
    expect(semanticSearch).toHaveBeenCalledTimes(1);

    expect(first.results).toHaveLength(2);
    expect(first.results[0]?.provenance.length).toBeGreaterThanOrEqual(2);
    expect(second.results).toHaveLength(2);
  });
});
