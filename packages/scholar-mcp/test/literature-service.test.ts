import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config.js';
import { Logger } from '../src/core/logger.js';
import { ResearchProviderError } from '../src/research/errors.js';
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
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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

  it('resolves exact DOI using direct OpenAlex lookup before ranked graph fallback', async () => {
    const config = parseConfig({
      NODE_ENV: 'test'
    });

    const service = new LiteratureService(config, new Logger('error'), {} as never);

    const openAlexByDoi = vi.fn(async () =>
      makeWork({
        provider: 'openalex',
        providerId: 'openalex:doi',
        doi: '10.1038/s41467-024-55563-6',
        url: 'https://doi.org/10.1038/s41467-024-55563-6',
        openAccess: {
          isOpenAccess: true,
          pdfUrl: 'https://www.nature.com/articles/s41467-024-55563-6.pdf',
          license: 'cc-by'
        }
      })
    );

    const searchGraphSpy = vi.spyOn(service, 'searchGraph');

    (service as unknown as { openAlexClient: { getWorkByDoi: typeof openAlexByDoi } }).openAlexClient = {
      getWorkByDoi: openAlexByDoi
    };

    const resolved = await service.resolveByDoi('10.1038/s41467-024-55563-6');

    expect(openAlexByDoi).toHaveBeenCalledWith('10.1038/s41467-024-55563-6');
    expect(searchGraphSpy).not.toHaveBeenCalled();
    expect(resolved?.doi).toBe('10.1038/s41467-024-55563-6');
    expect(resolved?.openAccess.pdfUrl).toBe('https://www.nature.com/articles/s41467-024-55563-6.pdf');
    expect(resolved?.provenance[0]?.provider).toBe('openalex');
  });

  it('filters results, records provider errors, and supports scholar scrape sources', async () => {
    const config = parseConfig({
      NODE_ENV: 'test'
    });

    const scholarService = {
      searchKeywords: vi.fn(async () => ({
        query: 'graph',
        totalResultsText: 'About 1 result',
        nextPageStart: null,
        requestedUrl: 'https://scholar.google.com/scholar?q=graph',
        papers: [
          {
            title: 'Graph Paper',
            abstract: 'Graph retrieval abstract',
            authorsLine: 'Jane Doe',
            url: 'https://example.org/paper',
            year: '2024',
            citedByCount: 10,
            citedByUrl: 'https://example.org/cited',
            relatedArticlesUrl: 'https://example.org/related',
            versionsCount: 2,
            versionsUrl: 'https://example.org/versions',
            pdfUrl: 'https://example.org/paper.pdf'
          }
        ]
      }))
    };

    const service = new LiteratureService(config, new Logger('error'), scholarService as never);
    (service as unknown as { openAlexClient: { searchWorks: () => Promise<ProviderWork[]> } }).openAlexClient = {
      searchWorks: vi.fn(async () => [
        makeWork({
          provider: 'openalex',
          year: 2018
        })
      ])
    };
    (service as unknown as { crossrefClient: { searchWorks: () => Promise<ProviderWork[]> } }).crossrefClient = {
      searchWorks: vi.fn(async () => {
        throw new ResearchProviderError('crossref down', 'crossref', 503);
      })
    };
    (service as unknown as { semanticScholarClient: { searchWorks: () => Promise<ProviderWork[]> } }).semanticScholarClient = {
      searchWorks: vi.fn(async () => [
        makeWork({
          provider: 'semantic_scholar',
          year: 2018
        })
      ])
    };

    const result = await service.searchGraph({
      query: 'graph',
      limit: 5,
      yearRange: [2020, 2025],
      sources: ['openalex', 'crossref', 'semantic_scholar', 'scholar_scrape']
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.title).toBe('Graph Paper');
    expect(result.providerErrors).toEqual([{ provider: 'crossref', message: 'crossref down' }]);
  });

  it('expires cached searches and falls back on DOI lookups after a 404', async () => {
    const config = parseConfig({
      NODE_ENV: 'test',
      RESEARCH_GRAPH_CACHE_TTL_MS: 1,
      RESEARCH_GRAPH_MAX_CACHE_ENTRIES: 1
    });

    const service = new LiteratureService(config, new Logger('error'), {} as never);
    const openAlexSearch = vi
      .fn()
      .mockResolvedValueOnce([makeWork({ providerId: 'openalex:1', title: 'One' })])
      .mockResolvedValueOnce([makeWork({ providerId: 'openalex:2', title: 'Two' })])
      .mockResolvedValueOnce([makeWork({ providerId: 'openalex:3', title: 'Three' })]);

    (service as unknown as { openAlexClient: { searchWorks: typeof openAlexSearch; getWorkByDoi: (doi: string) => Promise<ProviderWork | null> } }).openAlexClient = {
      searchWorks: openAlexSearch,
      getWorkByDoi: vi.fn(async () => {
        throw new ResearchProviderError('not found', 'openalex', 404);
      })
    };
    (service as unknown as { crossrefClient: { searchWorks: () => Promise<ProviderWork[]> } }).crossrefClient = {
      searchWorks: vi.fn(async () => [])
    };
    (service as unknown as { semanticScholarClient: { searchWorks: () => Promise<ProviderWork[]> } }).semanticScholarClient = {
      searchWorks: vi.fn(async () => [])
    };

    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0);
    await service.searchGraph({ query: 'one', limit: 1 });
    nowSpy.mockReturnValueOnce(2).mockReturnValueOnce(2).mockReturnValueOnce(2).mockReturnValueOnce(2);
    await service.searchGraph({ query: 'two', limit: 1 });
    nowSpy.mockReturnValueOnce(4).mockReturnValueOnce(4).mockReturnValueOnce(4).mockReturnValueOnce(4);
    await service.searchGraph({ query: 'one', limit: 1 });

    expect(openAlexSearch).toHaveBeenCalledTimes(3);

    const fallback = vi.spyOn(service, 'searchGraph').mockResolvedValue({
      query: '10.1000/three',
      totalResults: 1,
      providerErrors: [],
      results: [
        {
          title: 'Three',
          abstract: null,
          year: 2024,
          venue: null,
          doi: '10.1000/three',
          url: null,
          paperId: 'paper-3',
          citationCount: 0,
          influentialCitationCount: 0,
          referenceCount: 0,
          authors: [],
          openAccess: { isOpenAccess: false, pdfUrl: null, license: null },
          externalIds: { doi: '10.1000/three' },
          fieldsOfStudy: [],
          score: 0.1,
          provenance: []
        }
      ]
    });

    await expect(service.resolveByDoi('10.1000/three')).resolves.toMatchObject({
      doi: '10.1000/three'
    });
    expect(fallback).toHaveBeenCalled();
  });
});
