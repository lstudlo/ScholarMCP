import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config.js';
import { Logger } from '../src/core/logger.js';
import { ResearchService } from '../src/research/research-service.js';
import {
  DocumentNotFoundError,
  IngestionError,
  JobNotFoundError,
  ResearchError,
  ResearchProviderError
} from '../src/research/errors.js';
import { CrossrefClient } from '../src/research/providers/crossref-client.js';
import { OpenAlexClient } from '../src/research/providers/openalex-client.js';
import { SemanticScholarClient } from '../src/research/providers/semantic-scholar-client.js';
import {
  clamp,
  makeStableId,
  normalizeDoi,
  normalizeWhitespace,
  nowIso,
  overlapScore,
  parseYear,
  tokenizeForRanking
} from '../src/research/utils.js';
import { startStdioServer } from '../src/mcp/start-stdio-server.js';
import { getPackageVersion } from '../src/version.js';
import {
  ScholarBlockedError,
  ScholarError,
  ScholarFetchError,
  ScholarParseError
} from '../src/scholar/errors.js';

describe('research utils and errors', () => {
  it('formats timestamps and stable ids', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(makeStableId(['a', 'b'], 'doc')).toMatch(/^doc_[a-f0-9]{16}$/);
    expect(makeStableId([], 'doc')).toMatch(/^doc_/);
  });

  it('normalizes text, doi, years, and ranking helpers', () => {
    expect(normalizeWhitespace(' a \n b\tc ')).toBe('a b c');
    expect(normalizeDoi('https://doi.org/10.1000/ABC')).toBe('10.1000/abc');
    expect(parseYear('Published in 2024')).toBe(2024);
    expect(parseYear(2021)).toBe(2021);
    expect(parseYear('no year')).toBeNull();
    expect(clamp(20, 1, 10)).toBe(10);
    expect(tokenizeForRanking('A study on graph retrieval systems')).toEqual(['study', 'graph', 'retrieval', 'systems']);
    expect(overlapScore(['graph', 'retrieval'], ['graph', 'systems'])).toBe(0.5);
  });

  it('creates domain-specific errors', () => {
    expect(new ResearchError('boom').name).toBe('ResearchError');
    expect(new ResearchProviderError('boom', 'openalex', 500).provider).toBe('openalex');
    expect(new IngestionError('boom').name).toBe('IngestionError');
    expect(new DocumentNotFoundError('doc-1').details).toEqual({ documentId: 'doc-1' });
    expect(new JobNotFoundError('job-1').details).toEqual({ jobId: 'job-1' });

    expect(new ScholarError('boom').name).toBe('ScholarError');
    expect(new ScholarFetchError('boom', 'https://example.com').url).toBe('https://example.com');
    expect(new ScholarBlockedError('blocked', 'https://example.com').name).toBe('ScholarBlockedError');
    expect(new ScholarParseError('bad parse').name).toBe('ScholarParseError');
  });
});

describe('logger and version', () => {
  it('writes structured logs only at or above the configured level', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const logger = new Logger('warn');

    logger.info('skip me');
    logger.error('log me', { source: 'test' });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain('"level":"error"');
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain('"source":"test"');
    writeSpy.mockRestore();
  });

  it('reads the package version', () => {
    const packageVersion = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
    ).version as string;

    expect(getPackageVersion()).toBe(packageVersion);
  });
});

describe('research service wrappers', () => {
  it('delegates to the underlying services', async () => {
    const service = ResearchService.fromConfig(parseConfig({ NODE_ENV: 'test' }), new Logger('error'), {} as never);
    (service as never as { literatureService: unknown }).literatureService = {
      searchGraph: vi.fn(async () => ({ results: [], providerErrors: [], totalResults: 0, query: 'q' })),
      resolveByDoi: vi.fn(async () => null)
    };
    (service as never as { ingestionService: unknown }).ingestionService = {
      enqueueIngestion: vi.fn(() => ({ jobId: 'job-1' })),
      getJob: vi.fn(() => ({ jobId: 'job-1' })),
      getDocument: vi.fn(() => ({ documentId: 'doc-1' }))
    };
    (service as never as { extractionService: unknown }).extractionService = {
      extract: vi.fn(() => ({ documentId: 'doc-1' }))
    };
    (service as never as { citationService: unknown }).citationService = {
      suggestContextualCitations: vi.fn(async () => ({ suggestions: [] })),
      buildReferenceList: vi.fn(async () => ({ references: [] })),
      validateManuscriptCitations: vi.fn(() => ({ inlineCitationCount: 0 }))
    };

    await expect(service.searchLiteratureGraph({ query: 'q', limit: 1 })).resolves.toMatchObject({ query: 'q' });
    await expect(service.resolveWorkByDoi('10.1000/example')).resolves.toBeNull();
    expect(service.ingestPaperFullText({ doi: '10.1000/example' })).toMatchObject({ jobId: 'job-1' });
    expect(service.getIngestionStatus('job-1')).toMatchObject({ jobId: 'job-1' });
    expect(service.getParsedDocument('doc-1')).toMatchObject({ documentId: 'doc-1' });
    expect(service.extractGranularPaperDetails('doc-1', { includeReferences: true })).toMatchObject({ documentId: 'doc-1' });
    await expect(service.suggestContextualCitations({ manuscriptText: 'This is a sufficiently long manuscript text.', style: 'apa', k: 3, recencyBias: 0.5 })).resolves.toMatchObject({ suggestions: [] });
    await expect(service.buildReferenceList({ style: 'apa', works: [] })).resolves.toMatchObject({ references: [] });
    expect(service.validateManuscriptCitations('text', [])).toMatchObject({ inlineCitationCount: 0 });
  });
});

describe('provider clients', () => {
  const config = parseConfig({
    NODE_ENV: 'test',
    RESEARCH_OPENALEX_API_KEY: 'openalex-key',
    RESEARCH_SEMANTIC_SCHOLAR_API_KEY: 'semantic-key'
  });

  it('maps openalex search and doi lookups', async () => {
    const httpClient = {
      fetchJson: vi
        .fn()
        .mockResolvedValueOnce({
          results: [
            {
              id: 'https://openalex.org/W1',
              display_name: 'Graph Retrieval',
              publication_year: 2024,
              primary_location: {
                source: { display_name: 'Conf' },
                landing_page_url: 'https://example.org/paper',
                pdf_url: 'https://example.org/paper.pdf',
                license: 'cc-by'
              },
              open_access: {
                is_oa: true,
                oa_url: 'https://example.org/paper.pdf'
              },
              abstract_inverted_index: {
                graph: [0],
                retrieval: [1]
              },
              referenced_works_count: 10,
              cited_by_count: 25,
              ids: {
                doi: 'https://doi.org/10.1000/example',
                openalex: 'https://openalex.org/W1',
                pmid: '1',
                pmcid: 'PMC1'
              },
              concepts: [{ display_name: 'Computer Science' }],
              authorships: [{ author: { id: 'A1', display_name: 'Jane Doe' } }],
              relevance_score: 0.9
            }
          ]
        })
        .mockResolvedValueOnce({
          id: 'https://openalex.org/W2',
          display_name: 'Doi Result'
        })
    };

    const client = new OpenAlexClient(config, httpClient as never);
    const results = await client.searchWorks('graph retrieval', 5);
    const exact = await client.getWorkByDoi('10.1000/example');

    expect(results[0]).toMatchObject({
      provider: 'openalex',
      title: 'Graph Retrieval',
      abstract: 'graph retrieval',
      doi: '10.1000/example',
      venue: 'Conf'
    });
    expect(httpClient.fetchJson).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        provider: 'openalex',
        url: expect.any(URL)
      })
    );
    expect(exact).toMatchObject({
      providerId: 'https://openalex.org/W2',
      title: 'Doi Result'
    });
  });

  it('maps crossref responses', async () => {
    const httpClient = {
      fetchJson: vi.fn(async () => ({
        message: {
          items: [
            {
              DOI: '10.1000/crossref',
              title: ['Crossref Result'],
              abstract: '<jats:p>Structured abstract</jats:p>',
              issued: { 'date-parts': [[2022]] },
              'container-title': ['Journal'],
              URL: 'https://doi.org/10.1000/crossref',
              'is-referenced-by-count': 12,
              reference: [{}, {}],
              score: 0.77,
              author: [{ given: 'Jane', family: 'Doe', ORCID: 'https://orcid.org/0000-0001' }],
              subject: ['AI'],
              license: [{ URL: 'https://license.example.com' }],
              link: [{ URL: 'https://example.org/paper.pdf', 'content-type': 'application/pdf' }]
            }
          ]
        }
      }))
    };

    const client = new CrossrefClient(config, httpClient as never);
    const results = await client.searchWorks('crossref', 5);

    expect(results[0]).toMatchObject({
      provider: 'crossref',
      title: 'Crossref Result',
      abstract: 'Structured abstract',
      citationCount: 12,
      referenceCount: 2
    });
  });

  it('maps semantic scholar responses and forwards the api key', async () => {
    const httpClient = {
      fetchJson: vi.fn(async () => ({
        data: [
          {
            paperId: 'paper-1',
            title: 'Semantic Result',
            abstract: 'Abstract',
            year: 2023,
            venue: 'Venue',
            externalIds: { DOI: '10.1000/semantic' },
            url: 'https://example.org/paper',
            citationCount: 9,
            influentialCitationCount: 2,
            referenceCount: 4,
            isOpenAccess: true,
            openAccessPdf: { url: 'https://example.org/paper.pdf', license: 'cc-by' },
            fieldsOfStudy: ['AI'],
            authors: [{ authorId: 'author-1', name: 'Alice' }]
          }
        ]
      }))
    };

    const client = new SemanticScholarClient(config, httpClient as never);
    const results = await client.searchWorks('semantic', 3);

    expect(results[0]).toMatchObject({
      provider: 'semantic_scholar',
      title: 'Semantic Result',
      doi: '10.1000/semantic',
      influentialCitationCount: 2
    });
    expect(httpClient.fetchJson).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'semantic-key'
        })
      })
    );
  });
});

describe('stdio server bootstrap', () => {
  it('connects the created MCP server and logs readiness', async () => {
    const connect = vi.fn(async () => undefined);
    const info = vi.spyOn(Logger.prototype, 'info').mockImplementation(() => undefined);
    const createServer = vi.spyOn(await import('../src/mcp/create-scholar-mcp-server.js'), 'createScholarMcpServer');
    createServer.mockReturnValue({
      connect
    } as never);

    await startStdioServer(parseConfig({ NODE_ENV: 'test' }), {} as never, {} as never, new Logger('error'));

    expect(connect).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith('ScholarMCP stdio transport ready');
    info.mockRestore();
    createServer.mockRestore();
  });
});
