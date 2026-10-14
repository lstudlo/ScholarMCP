import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config.js';
import { Logger } from '../src/core/logger.js';
import { ScholarParseError } from '../src/scholar/errors.js';

const registeredTools = vi.hoisted(() => new Map<string, { schema: unknown; handler: (args: any) => Promise<unknown> }>());

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class MockMcpServer {
    registerTool(name: string, schema: unknown, handler: (args: any) => Promise<unknown>) {
      registeredTools.set(name, { schema, handler });
    }

    close = vi.fn(async () => undefined);
  }
}));

describe('createScholarMcpServer', () => {
  afterEach(() => {
    registeredTools.clear();
    vi.clearAllMocks();
  });

  it('registers the MCP tools and maps successful research calls', async () => {
    const { createScholarMcpServer } = await import('../src/mcp/create-scholar-mcp-server.js');

    const service = {
      searchKeywords: vi.fn(async () => ({
        query: 'graph',
        totalResultsText: 'About 1 result',
        nextPageStart: null,
        requestedUrl: 'https://scholar.google.com/scholar?q=graph',
        papers: [
          {
            title: 'Graph Paper',
            authorsLine: 'Jane Doe',
            abstract: 'Abstract',
            url: 'https://example.org/paper',
            year: '2024',
            citedByCount: 5,
            citedByUrl: 'https://example.org/cited',
            relatedArticlesUrl: 'https://example.org/related',
            versionsCount: 2,
            versionsUrl: 'https://example.org/versions',
            pdfUrl: 'https://example.org/paper.pdf'
          }
        ]
      })),
      searchAdvanced: vi.fn(async () => ({
        query: 'advanced',
        totalResultsText: 'About 2 results',
        nextPageStart: 10,
        papers: []
      })),
      getAuthorInfo: vi.fn(async () => ({
        authorName: 'Jane Doe',
        affiliation: 'Example University',
        interests: ['AI'],
        metrics: {
          citationsAll: 10,
          citationsSince: 5,
          hIndexAll: 3,
          hIndexSince: 2,
          i10IndexAll: 1,
          i10IndexSince: 1
        },
        authorId: 'AAA111AAAAJ',
        profileUrl: 'https://scholar.google.com/citations?user=AAA111AAAAJ',
        verifiedEmail: 'example.edu',
        homepageUrl: null,
        publications: []
      }))
    };

    const researchService = {
      searchLiteratureGraph: vi.fn(async () => ({
        query: 'graph',
        totalResults: 1,
        providerErrors: [],
        results: [{ title: 'Graph Paper' }]
      })),
      ingestPaperFullText: vi.fn(() => ({ jobId: 'job-1', documentId: 'doc-1' })),
      getIngestionStatus: vi.fn(() => ({
        jobId: 'job-1',
        documentId: 'doc-1',
        status: 'succeeded'
      })),
      getParsedDocument: vi.fn(() => ({
        documentId: 'doc-1',
        title: 'Graph Paper',
        abstract: 'Abstract',
        parser: { parserName: 'pdf-parse', parserVersion: '2.x', confidence: 0.7 },
        sections: [{ id: 's1' }],
        references: [{ rawText: 'Ref' }],
        createdAt: '2025-01-01T00:00:00.000Z'
      })),
      extractGranularPaperDetails: vi.fn(() => ({ documentId: 'doc-1', claims: [] })),
      suggestContextualCitations: vi.fn(async () => ({ suggestions: [] })),
      buildReferenceList: vi.fn(async () => ({
        references: [{ id: 'ref-1' }],
        bibliographyText: 'Doe (2024)',
        bibtex: '@article{doe2024}'
      })),
      validateManuscriptCitations: vi.fn(() => ({ inlineCitationCount: 1, missingReferences: [] }))
    };

    createScholarMcpServer(parseConfig({ NODE_ENV: 'test' }), service as never, researchService as never, new Logger('error'));

    expect(registeredTools.size).toBe(10);

    const searchGraph = registeredTools.get('search_literature_graph');
    const graphResult = (await searchGraph?.handler({
      query: 'graph',
      year_range: { start: 2020, end: 2024 },
      fields_of_study: ['AI'],
      limit: 5,
      sources: ['openalex']
    })) as any;

    expect(researchService.searchLiteratureGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        yearRange: [2020, 2024],
        fieldsOfStudy: ['AI'],
        sources: ['openalex']
      })
    );
    expect(graphResult.structuredContent.results).toHaveLength(1);

    const ingest = registeredTools.get('ingest_paper_fulltext');
    const ingestResult = (await ingest?.handler({
      doi: '10.1000/example',
      parse_mode: 'auto',
      ocr_enabled: true
    })) as any;
    expect(ingestResult.structuredContent.jobId).toBe('job-1');

    const status = registeredTools.get('get_ingestion_status');
    const statusResult = (await status?.handler({ job_id: 'job-1' })) as any;
    expect(statusResult.structuredContent.document_summary.title).toBe('Graph Paper');

    const extract = registeredTools.get('extract_granular_paper_details');
    await expect(extract?.handler({ document_id: 'doc-1', include_references: true })).resolves.toMatchObject({
      structuredContent: { documentId: 'doc-1' }
    });

    const suggest = registeredTools.get('suggest_contextual_citations');
    await expect(
      suggest?.handler({
        manuscript_text: 'This manuscript is definitely long enough to request suggestions.',
        style: 'apa',
        k: 5,
        recency_bias: 0.5
      })
    ).resolves.toMatchObject({
      structuredContent: { suggestions: [] }
    });

    const build = registeredTools.get('build_reference_list');
    await expect(
      build?.handler({
        style: 'apa',
        locale: 'en-US',
        works: [{ title: 'Graph Paper', authors: ['Jane Doe'], citation_count: 3 }]
      })
    ).resolves.toMatchObject({
      structuredContent: { references: [{ id: 'ref-1' }] }
    });

    const validate = registeredTools.get('validate_manuscript_citations');
    await expect(
      validate?.handler({
        manuscript_text: 'This manuscript is definitely long enough [1].',
        references: [{ formatted: 'Doe (2024)' }]
      })
    ).resolves.toMatchObject({
      structuredContent: { inlineCitationCount: 1 }
    });

    const keywordSearch = registeredTools.get('search_google_scholar_key_words');
    await expect(
      keywordSearch?.handler({ query: 'graph', num_results: 1, start: 0, language: 'en' })
    ).resolves.toMatchObject({
      structuredContent: { results: [expect.objectContaining({ Title: 'Graph Paper' })] }
    });

    const advancedSearch = registeredTools.get('search_google_scholar_advanced');
    await expect(
      advancedSearch?.handler({
        query: 'advanced',
        year_range: { start: 2020, end: 2024 },
        num_results: 5,
        start: 0,
        language: 'en'
      })
    ).resolves.toMatchObject({
      structuredContent: { totalResultsText: 'About 2 results' }
    });

    const authorInfo = registeredTools.get('get_author_info');
    await expect(
      authorInfo?.handler({ author_name: 'Jane Doe', max_publications: 5, language: 'en' })
    ).resolves.toMatchObject({
      structuredContent: { author_id: 'AAA111AAAAJ' }
    });
  });

  it('reads DOI and URL from the provided references when validating citations', async () => {
    const { createScholarMcpServer } = await import('../src/mcp/create-scholar-mcp-server.js');
    const { CitationService } = await import('../src/research/citation-service.js');
    const citationService = new CitationService({} as never);
    const researchService = {
      validateManuscriptCitations: citationService.validateManuscriptCitations.bind(citationService)
    };

    createScholarMcpServer(parseConfig({ NODE_ENV: 'test' }), {} as never, researchService as never, new Logger('error'));

    const validate = registeredTools.get('validate_manuscript_citations');
    const result = (await validate?.handler({
      manuscript_text: 'Transformers (Vaswani, 2017) and retrieval (Lewis, 2020) both matter.',
      style: 'apa',
      references: [
        {
          formatted:
            'Vaswani, A. (2017). Attention is all you need. NeurIPS. https://doi.org/10.48550/arXiv.1706.03762'
        },
        {
          formatted: 'Lewis, P. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. NeurIPS.',
          bibtex: '@inproceedings{lewis2020, doi={10.48550/arXiv.2005.11401}, url={https://arxiv.org/abs/2005.11401}}'
        },
        { formatted: 'Doe, J. (2021). A reference without any identifier. Journal X.' }
      ]
    })) as any;

    const diagnostics = result.structuredContent.completenessDiagnostics;
    expect(diagnostics.map((item: any) => item.missingPersistentIdentifier)).toEqual([false, false, true]);
    expect(diagnostics[0].missingElements).not.toContain('source');
    expect(diagnostics[1].missingElements).not.toContain('source');
    expect(result.structuredContent.styleWarnings).toContain(
      '1 reference(s) are missing a DOI/URL, which weakens APA traceability requirements.'
    );
  });

  it('keeps parentheses that belong to a DOI and ignores BibTeX URLs that are not links', async () => {
    const { createScholarMcpServer } = await import('../src/mcp/create-scholar-mcp-server.js');
    const { CitationService } = await import('../src/research/citation-service.js');
    const citationService = new CitationService({} as never);
    const researchService = {
      validateManuscriptCitations: citationService.validateManuscriptCitations.bind(citationService)
    };

    createScholarMcpServer(parseConfig({ NODE_ENV: 'test' }), {} as never, researchService as never, new Logger('error'));

    const validate = registeredTools.get('validate_manuscript_citations');
    const result = (await validate?.handler({
      manuscript_text: 'Series (Smith, 2020), text (Jones, 2021) and preprints (Lee, 2022) all matter.',
      style: 'apa',
      references: [
        {
          formatted: 'Smith, A. (2020). A study in a series. Journal Y.',
          bibtex: '@article{smith2020, doi={10.1234/series(2020)}}'
        },
        { formatted: 'Jones, B. (2021). A study cited in text (doi:10.5555/abc(1)).' },
        {
          formatted: 'Lee, C. (2022). A forthcoming paper. Journal Z.',
          bibtex: '@article{lee2022, url={forthcoming}}'
        }
      ]
    })) as any;

    const diagnostics = result.structuredContent.completenessDiagnostics;
    expect(diagnostics[0].suggestions).toContain(
      'Reference 1: include DOI as canonical URL (https://doi.org/10.1234/series(2020)).'
    );
    expect(diagnostics[1].suggestions).toContain(
      'Reference 2: include DOI as canonical URL (https://doi.org/10.5555/abc(1)).'
    );
    expect(diagnostics[2].missingPersistentIdentifier).toBe(true);
  });

  it('maps known and generic failures into MCP tool errors', async () => {
    const { createScholarMcpServer } = await import('../src/mcp/create-scholar-mcp-server.js');
    const loggerWarn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const service = {
      searchKeywords: vi.fn(async () => {
        throw new ScholarParseError('Unable to parse');
      }),
      searchAdvanced: vi.fn(async () => {
        throw new Error('advanced failed');
      }),
      getAuthorInfo: vi.fn(async () => {
        throw new Error('author failed');
      })
    };

    const researchService = {
      searchLiteratureGraph: vi.fn(async () => {
        throw new Error('graph failed');
      }),
      buildReferenceList: vi.fn(async () => {
        throw new Error('build failed');
      })
    };

    createScholarMcpServer(parseConfig({ NODE_ENV: 'test' }), service as never, researchService as never, new Logger('error'));

    const searchGraph = registeredTools.get('search_literature_graph');
    await expect(searchGraph?.handler({ query: 'graph', limit: 1 })).resolves.toMatchObject({
      isError: true,
      structuredContent: {
        error: 'Error',
        message: 'graph failed'
      }
    });

    const build = registeredTools.get('build_reference_list');
    await expect(build?.handler({ style: 'apa' })).resolves.toMatchObject({
      isError: true,
      structuredContent: {
        error: 'Error',
        message: 'Provide either manuscript_text or works.'
      }
    });

    const keywordSearch = registeredTools.get('search_google_scholar_key_words');
    await expect(keywordSearch?.handler({ query: 'graph', num_results: 1, start: 0, language: 'en' })).resolves.toMatchObject({
      isError: true,
      structuredContent: {
        error: 'ScholarParseError',
        message: 'Unable to parse'
      }
    });

    const advancedSearch = registeredTools.get('search_google_scholar_advanced');
    await expect(advancedSearch?.handler({ query: 'advanced', num_results: 5, start: 0, language: 'en' })).resolves.toMatchObject({
      isError: true,
      structuredContent: {
        error: 'Error',
        message: 'advanced failed'
      }
    });

    const authorInfo = registeredTools.get('get_author_info');
    await expect(authorInfo?.handler({ author_name: 'Jane Doe', max_publications: 5, language: 'en' })).resolves.toMatchObject({
      isError: true,
      structuredContent: {
        error: 'Error',
        message: 'author failed'
      }
    });

    expect(loggerWarn).toHaveBeenCalled();
    loggerWarn.mockRestore();
  });
});
