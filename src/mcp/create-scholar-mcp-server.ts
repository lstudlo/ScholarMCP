import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { Logger } from '../core/logger.js';
import { ResearchService } from '../research/research-service.js';
import { ScholarError } from '../scholar/errors.js';
import { ScholarService } from '../scholar/scholar-service.js';
import type { ScholarPaperResult } from '../scholar/types.js';

const paperToLegacyShape = (paper: ScholarPaperResult) => ({
  Title: paper.title,
  Authors: paper.authorsLine,
  Abstract: paper.abstract,
  URL: paper.url,
  Year: paper.year,
  CitedBy: paper.citedByCount,
  CitedByURL: paper.citedByUrl,
  RelatedArticlesURL: paper.relatedArticlesUrl,
  Versions: paper.versionsCount,
  VersionsURL: paper.versionsUrl,
  PDFURL: paper.pdfUrl
});

const toToolError = (error: unknown): CallToolResult => {
  const fallbackMessage = 'Unknown ScholarMCP error.';

  if (error instanceof ScholarError) {
    return {
      isError: true,
      content: [{ type: 'text', text: error.message }],
      structuredContent: {
        error: error.name,
        message: error.message,
        details: error.details
      }
    };
  }

  if (error instanceof Error) {
    return {
      isError: true,
      content: [{ type: 'text', text: error.message }],
      structuredContent: {
        error: error.name,
        message: error.message
      }
    };
  }

  return {
    isError: true,
    content: [{ type: 'text', text: fallbackMessage }],
    structuredContent: {
      error: 'UnknownError',
      message: fallbackMessage
    }
  };
};

const manualWorkSchema = z.object({
  title: z.string().min(1),
  abstract: z.string().optional(),
  year: z.number().int().optional(),
  venue: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  citation_count: z.number().int().optional(),
  authors: z.array(z.string()).optional()
});

export const createScholarMcpServer = (
  config: AppConfig,
  service: ScholarService,
  researchService: ResearchService,
  logger: Logger
): McpServer => {
  const server = new McpServer(
    {
      name: config.serverName,
      version: config.serverVersion,
      title: 'ScholarMCP',
      description: 'Google Scholar research tools exposed over MCP'
    },
    {
      capabilities: {
        logging: {}
      }
    }
  );

  server.registerTool(
    'search_literature_graph',
    {
      title: 'Search Federated Literature Graph',
      description:
        'Search multiple scholarly metadata providers (OpenAlex, Crossref, Semantic Scholar, optional Scholar scrape) and return canonicalized paper records.',
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      },
      inputSchema: {
        query: z.string().min(1).describe('Research query string.'),
        year_range: z
          .union([
            z.tuple([z.number().int(), z.number().int()]),
            z.object({ start: z.number().int(), end: z.number().int() })
          ])
          .optional()
          .describe('Optional publication year range as [start, end] or {start, end}.'),
        fields_of_study: z.array(z.string().min(1)).optional().describe('Optional field-of-study filters.'),
        limit: z.number().int().min(1).max(50).default(10).describe('Maximum number of merged results.'),
        sources: z
          .array(z.enum(['openalex', 'crossref', 'semantic_scholar', 'scholar_scrape']))
          .optional()
          .describe('Optional source allow-list.')
      }
    },
    async (args): Promise<CallToolResult> => {
      try {
        const normalizedYearRange = (() => {
          if (!args.year_range) {
            return undefined;
          }

          if (Array.isArray(args.year_range)) {
            return args.year_range;
          }

          return [args.year_range.start, args.year_range.end] as [number, number];
        })();

        const result = await researchService.searchLiteratureGraph({
          query: args.query,
          yearRange: normalizedYearRange,
          fieldsOfStudy: args.fields_of_study,
          limit: args.limit,
          sources: args.sources
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result as unknown as Record<string, unknown>
        };
      } catch (error) {
        logger.warn('Federated literature search failed', {
          tool: 'search_literature_graph',
          query: args.query,
          error: error instanceof Error ? error.message : String(error)
        });
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    'ingest_paper_fulltext',
    {
      title: 'Ingest Full-Text Paper',
      description:
        'Resolve and ingest a full-text PDF from DOI/URL/local file, then parse into a structured document using GROBID/sidecar/simple fallback pipeline.',
      annotations: {
        readOnlyHint: false,
        openWorldHint: true
      },
      inputSchema: {
        doi: z.string().optional().describe('DOI (recommended for OA PDF discovery).'),
        paper_url: z.string().url().optional().describe('Landing page URL for the paper.'),
        pdf_url: z.string().url().optional().describe('Direct PDF URL.'),
        local_pdf_path: z.string().optional().describe('Local absolute or workspace-relative PDF path.'),
        parse_mode: z.enum(['auto', 'grobid', 'sidecar', 'simple']).default('auto'),
        ocr_enabled: z.boolean().default(true).describe('Reserved for OCR-capable parser modes.')
      }
    },
    async ({ doi, paper_url, pdf_url, local_pdf_path, parse_mode, ocr_enabled }): Promise<CallToolResult> => {
      try {
        if (!doi && !paper_url && !pdf_url && !local_pdf_path) {
          throw new Error('Provide at least one source: doi, paper_url, pdf_url, or local_pdf_path.');
        }

        const job = researchService.ingestPaperFullText({
          doi,
          paperUrl: paper_url,
          pdfUrl: pdf_url,
          localPdfPath: local_pdf_path,
          parseMode: parse_mode,
          ocrEnabled: ocr_enabled
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(job, null, 2) }],
          structuredContent: job as unknown as Record<string, unknown>
        };
      } catch (error) {
        logger.warn('Full-text ingestion start failed', {
          tool: 'ingest_paper_fulltext',
          doi,
          paper_url,
          pdf_url,
          local_pdf_path,
          error: error instanceof Error ? error.message : String(error)
        });
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    'get_ingestion_status',
    {
      title: 'Get Full-Text Ingestion Status',
      description: 'Get the status of a previously started ingest_paper_fulltext job.',
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      },
      inputSchema: {
        job_id: z.string().min(1).describe('Ingestion job id returned by ingest_paper_fulltext.')
      }
    },
    async ({ job_id }): Promise<CallToolResult> => {
      try {
        const job = researchService.getIngestionStatus(job_id);
        const payload: Record<string, unknown> = {
          ...job
        };

        if (job.status === 'succeeded') {
          const document = researchService.getParsedDocument(job.documentId);
          payload.document_summary = {
            documentId: document.documentId,
            title: document.title,
            abstract: document.abstract,
            parser: document.parser,
            sections: document.sections.length,
            references: document.references.length,
            createdAt: document.createdAt
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload
        };
      } catch (error) {
        logger.warn('Ingestion status lookup failed', {
          tool: 'get_ingestion_status',
          job_id,
          error: error instanceof Error ? error.message : String(error)
        });
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    'extract_granular_paper_details',
    {
      title: 'Extract Granular Paper Details',
      description:
        'Extract claims, methods, limitations, datasets, metrics, and section-aware summaries from a parsed document.',
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      },
      inputSchema: {
        document_id: z.string().min(1),
        sections: z.array(z.string().min(1)).optional(),
        include_references: z.boolean().default(true)
      }
    },
    async ({ document_id, sections, include_references }): Promise<CallToolResult> => {
      try {
        const result = researchService.extractGranularPaperDetails(document_id, {
          sections,
          includeReferences: include_references
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result as unknown as Record<string, unknown>
        };
      } catch (error) {
        logger.warn('Granular extraction failed', {
          tool: 'extract_granular_paper_details',
          document_id,
          error: error instanceof Error ? error.message : String(error)
        });
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    'suggest_contextual_citations',
    {
      title: 'Suggest Context-Aware Citations',
      description: 'Recommend citations from the federated literature graph based on manuscript context.',
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      },
      inputSchema: {
        manuscript_text: z.string().min(20),
        cursor_context: z.string().optional(),
        style: z.enum(['apa', 'ieee', 'chicago', 'vancouver']).default('apa'),
        k: z.number().int().min(1).max(30).default(10),
        recency_bias: z.number().min(0).max(1).default(0.5)
      }
    },
    async ({ manuscript_text, cursor_context, style, k, recency_bias }): Promise<CallToolResult> => {
      try {
        const result = await researchService.suggestContextualCitations({
          manuscriptText: manuscript_text,
          cursorContext: cursor_context,
          style,
          k,
          recencyBias: recency_bias
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result as unknown as Record<string, unknown>
        };
      } catch (error) {
        logger.warn('Citation suggestion failed', {
          tool: 'suggest_contextual_citations',
          error: error instanceof Error ? error.message : String(error)
        });
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    'build_reference_list',
    {
      title: 'Build Reference List',
      description: 'Generate CSL-formatted bibliography and BibTeX entries from manuscript context or explicit works.',
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      },
      inputSchema: {
        style: z.enum(['apa', 'ieee', 'chicago', 'vancouver']).default('apa'),
        locale: z.string().default('en-US'),
        manuscript_text: z.string().optional(),
        works: z.array(manualWorkSchema).optional()
      }
    },
    async ({ style, locale, manuscript_text, works }): Promise<CallToolResult> => {
      try {
        if ((!manuscript_text || manuscript_text.trim().length === 0) && (!works || works.length === 0)) {
          throw new Error('Provide either manuscript_text or works.');
        }

        const normalizedWorks = (works ?? []).map((work) => ({
          title: work.title,
          abstract: work.abstract ?? null,
          year: work.year ?? null,
          venue: work.venue ?? null,
          doi: work.doi ?? null,
          url: work.url ?? null,
          paperId: work.doi ?? work.url ?? work.title,
          citationCount: work.citation_count ?? 0,
          influentialCitationCount: 0,
          referenceCount: 0,
          authors: (work.authors ?? []).map((name) => ({ name })),
          openAccess: {
            isOpenAccess: false,
            pdfUrl: null,
            license: null
          },
          externalIds: {},
          fieldsOfStudy: [],
          score: 0.5,
          provenance: []
        }));

        const result = await researchService.buildReferenceList({
          style,
          locale,
          manuscriptText: manuscript_text,
          works: normalizedWorks
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result as unknown as Record<string, unknown>
        };
      } catch (error) {
        logger.warn('Reference list build failed', {
          tool: 'build_reference_list',
          error: error instanceof Error ? error.message : String(error)
        });
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    'validate_manuscript_citations',
    {
      title: 'Validate Manuscript Citations',
      description: 'Validate inline citations against reference entries and detect missing or uncited references.',
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      },
      inputSchema: {
        manuscript_text: z.string().min(20),
        style: z.enum(['apa', 'ieee', 'chicago', 'vancouver']).optional(),
        references: z.array(
          z.object({
            id: z.string().optional(),
            formatted: z.string().min(1),
            bibtex: z.string().optional()
          })
        )
      }
    },
    async ({ manuscript_text, references, style }): Promise<CallToolResult> => {
      try {
        const normalizedReferences = references.map((reference, index) => ({
          id: reference.id ?? `ref-${index + 1}`,
          csl: {},
          formatted: reference.formatted,
          bibtex: reference.bibtex ?? '',
          sourceWork: {
            title: reference.formatted,
            abstract: null,
            year: null,
            venue: null,
            doi: null,
            url: null,
            paperId: reference.id ?? `ref-${index + 1}`,
            citationCount: 0,
            influentialCitationCount: 0,
            referenceCount: 0,
            authors: [],
            openAccess: {
              isOpenAccess: false,
              license: null,
              pdfUrl: null
            },
            externalIds: {},
            fieldsOfStudy: [],
            score: 0,
            provenance: []
          }
        }));

        const result = researchService.validateManuscriptCitations(manuscript_text, normalizedReferences, {
          style
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result as unknown as Record<string, unknown>
        };
      } catch (error) {
        logger.warn('Citation validation failed', {
          tool: 'validate_manuscript_citations',
          error: error instanceof Error ? error.message : String(error)
        });
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    'search_google_scholar_key_words',
    {
      title: 'Search Google Scholar by Keywords',
      description: 'Search Google Scholar using keywords and return paper metadata.',
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      },
      inputSchema: {
        query: z.string().min(1).describe('Search query string'),
        num_results: z.number().int().min(1).max(20).default(5).describe('Number of results to return'),
        start: z.number().int().min(0).default(0).describe('Offset for pagination (0, 10, 20, ...)'),
        language: z.string().default(config.scholarLanguage).describe('Google Scholar language code (e.g., en)')
      }
    },
    async ({ query, num_results, start, language }): Promise<CallToolResult> => {
      try {
        const result = await service.searchKeywords({
          query,
          numResults: num_results,
          start,
          language
        });

        const legacyResults = result.papers.map(paperToLegacyShape);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  query: result.query,
                  total_results_text: result.totalResultsText,
                  next_page_start: result.nextPageStart,
                  results: legacyResults
                },
                null,
                2
              )
            }
          ],
          structuredContent: {
            query: result.query,
            totalResultsText: result.totalResultsText,
            nextPageStart: result.nextPageStart,
            results: legacyResults
          }
        };
      } catch (error) {
        logger.warn('Keyword search tool failed', {
          tool: 'search_google_scholar_key_words',
          query,
          error: error instanceof Error ? error.message : String(error)
        });
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    'search_google_scholar_advanced',
    {
      title: 'Search Google Scholar with Advanced Filters',
      description:
        'Search Google Scholar using keyword, author, year-range, phrase, and exclusion filters.',
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      },
      inputSchema: {
        query: z.string().min(1).describe('General search query'),
        author: z.string().optional().describe('Author filter value'),
        year_range: z
          .union([
            z.tuple([z.number().int(), z.number().int()]),
            z.object({ start: z.number().int(), end: z.number().int() })
          ])
          .optional()
          .describe('Year range as [start, end] or { start, end }'),
        exact_phrase: z.string().optional().describe('Exact phrase that must appear in results'),
        exclude_words: z.string().optional().describe('Words that should be excluded from results'),
        title_only: z.boolean().default(false).describe('Restrict search terms to title only'),
        num_results: z.number().int().min(1).max(20).default(5),
        start: z.number().int().min(0).default(0),
        language: z.string().default(config.scholarLanguage)
      }
    },
    async (args): Promise<CallToolResult> => {
      try {
        const normalizedYearRange = (() => {
          if (!args.year_range) {
            return undefined;
          }

          if (Array.isArray(args.year_range)) {
            return args.year_range;
          }

          return [args.year_range.start, args.year_range.end] as [number, number];
        })();

        const result = await service.searchAdvanced({
          query: args.query,
          author: args.author,
          yearRange: normalizedYearRange,
          exactPhrase: args.exact_phrase,
          excludeWords: args.exclude_words,
          titleOnly: args.title_only,
          numResults: args.num_results,
          start: args.start,
          language: args.language
        });

        const legacyResults = result.papers.map(paperToLegacyShape);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  query: result.query,
                  total_results_text: result.totalResultsText,
                  next_page_start: result.nextPageStart,
                  results: legacyResults
                },
                null,
                2
              )
            }
          ],
          structuredContent: {
            query: result.query,
            totalResultsText: result.totalResultsText,
            nextPageStart: result.nextPageStart,
            results: legacyResults
          }
        };
      } catch (error) {
        logger.warn('Advanced search tool failed', {
          tool: 'search_google_scholar_advanced',
          error: error instanceof Error ? error.message : String(error)
        });
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    'get_author_info',
    {
      title: 'Get Author Info',
      description: 'Retrieve a Google Scholar author profile and top publications by author name.',
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      },
      inputSchema: {
        author_name: z.string().min(1).describe('Full author name to resolve in Google Scholar'),
        max_publications: z.number().int().min(1).max(20).default(5),
        language: z.string().default(config.scholarLanguage)
      }
    },
    async ({ author_name, max_publications, language }): Promise<CallToolResult> => {
      try {
        const author = await service.getAuthorInfo(author_name, max_publications, language);

        const pythonCompatibilityPayload = {
          name: author.authorName,
          affiliation: author.affiliation,
          interests: author.interests,
          citedby: author.metrics.citationsAll ?? 0,
          author_id: author.authorId,
          profile_url: author.profileUrl,
          verified_email: author.verifiedEmail,
          homepage: author.homepageUrl,
          metrics: {
            citations_all: author.metrics.citationsAll,
            citations_since_2021: author.metrics.citationsSince,
            h_index_all: author.metrics.hIndexAll,
            h_index_since_2021: author.metrics.hIndexSince,
            i10_index_all: author.metrics.i10IndexAll,
            i10_index_since_2021: author.metrics.i10IndexSince
          },
          publications: author.publications.map((publication) => ({
            title: publication.title,
            year: publication.year,
            citations: publication.citations,
            authors: publication.authors,
            venue: publication.venue,
            url: publication.detailUrl
          }))
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(pythonCompatibilityPayload, null, 2) }],
          structuredContent: pythonCompatibilityPayload
        };
      } catch (error) {
        logger.warn('Author info tool failed', {
          tool: 'get_author_info',
          author_name,
          error: error instanceof Error ? error.message : String(error)
        });
        return toToolError(error);
      }
    }
  );

  return server;
};
