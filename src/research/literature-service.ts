import type { AppConfig } from '../config.js';
import { Logger } from '../core/logger.js';
import { ScholarService } from '../scholar/scholar-service.js';
import type { CanonicalWork, ProvenanceRecord } from './types.js';
import { normalizeDoi, normalizeWhitespace, parseYear } from './utils.js';
import { ResearchHttpClient } from './http-client.js';
import type { ProviderWork } from './providers/openalex-client.js';
import { OpenAlexClient } from './providers/openalex-client.js';
import { CrossrefClient } from './providers/crossref-client.js';
import { SemanticScholarClient } from './providers/semantic-scholar-client.js';

export interface LiteratureSearchInput {
  query: string;
  yearRange?: [number, number];
  fieldsOfStudy?: string[];
  limit: number;
  sources?: Array<'openalex' | 'crossref' | 'semantic_scholar' | 'scholar_scrape'>;
}

export interface LiteratureSearchResult {
  query: string;
  totalResults: number;
  results: CanonicalWork[];
  providerErrors: Array<{ provider: string; message: string }>;
}

const providerWeight: Record<ProviderWork['provider'], number> = {
  openalex: 1,
  crossref: 0.9,
  semantic_scholar: 1.1,
  scholar_scrape: 0.7
};

const scoreFromCitations = (citations: number): number => {
  if (citations <= 0) {
    return 0;
  }

  return Math.min(1, Math.log10(citations + 1) / 4);
};

const normalizeTitleKey = (title: string): string =>
  normalizeWhitespace(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '');

const buildKey = (work: ProviderWork): string => {
  if (work.doi) {
    return `doi:${work.doi}`;
  }

  const titleKey = normalizeTitleKey(work.title);
  const year = work.year ?? 0;
  return `title:${titleKey}:year:${year}`;
};

const mergeFields = (current: string[], incoming: string[]): string[] => {
  const set = new Set(current);
  for (const value of incoming) {
    if (value) {
      set.add(value);
    }
  }

  return [...set];
};

const isWithinYearRange = (year: number | null, range?: [number, number]): boolean => {
  if (!range || !year) {
    return true;
  }

  return year >= range[0] && year <= range[1];
};

const matchesFieldOfStudy = (work: ProviderWork, requestedFields?: string[]): boolean => {
  if (!requestedFields || requestedFields.length === 0) {
    return true;
  }

  const normalized = new Set(work.fieldsOfStudy.map((field) => field.trim().toLowerCase()));
  return requestedFields.some((field) => normalized.has(field.trim().toLowerCase()));
};

export class LiteratureService {
  private readonly httpClient: ResearchHttpClient;
  private readonly openAlexClient: OpenAlexClient;
  private readonly crossrefClient: CrossrefClient;
  private readonly semanticScholarClient: SemanticScholarClient;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly scholarService: ScholarService
  ) {
    this.httpClient = new ResearchHttpClient(config);
    this.openAlexClient = new OpenAlexClient(config, this.httpClient);
    this.crossrefClient = new CrossrefClient(config, this.httpClient);
    this.semanticScholarClient = new SemanticScholarClient(config, this.httpClient);
  }

  async searchGraph(input: LiteratureSearchInput): Promise<LiteratureSearchResult> {
    const requestedSources = new Set(input.sources ?? ['openalex', 'crossref', 'semantic_scholar']);
    const providerErrors: Array<{ provider: string; message: string }> = [];

    const providerPromises: Array<Promise<ProviderWork[]>> = [];

    if (requestedSources.has('openalex')) {
      providerPromises.push(
        this.openAlexClient.searchWorks(input.query, input.limit).catch((error) => {
          providerErrors.push({ provider: 'openalex', message: error instanceof Error ? error.message : String(error) });
          return [];
        })
      );
    }

    if (requestedSources.has('crossref')) {
      providerPromises.push(
        this.crossrefClient.searchWorks(input.query, input.limit).catch((error) => {
          providerErrors.push({ provider: 'crossref', message: error instanceof Error ? error.message : String(error) });
          return [];
        })
      );
    }

    if (requestedSources.has('semantic_scholar')) {
      providerPromises.push(
        this.semanticScholarClient.searchWorks(input.query, input.limit).catch((error) => {
          providerErrors.push({ provider: 'semantic_scholar', message: error instanceof Error ? error.message : String(error) });
          return [];
        })
      );
    }

    if (requestedSources.has('scholar_scrape')) {
      providerPromises.push(
        this.searchWithScholarScrape(input.query, input.limit).catch((error) => {
          providerErrors.push({ provider: 'scholar_scrape', message: error instanceof Error ? error.message : String(error) });
          return [];
        })
      );
    }

    const providerResults = (await Promise.all(providerPromises)).flat();
    const filtered = providerResults.filter(
      (work) => isWithinYearRange(work.year, input.yearRange) && matchesFieldOfStudy(work, input.fieldsOfStudy)
    );

    const merged = new Map<string, CanonicalWork>();

    for (const work of filtered) {
      const key = buildKey(work);
      const confidence = providerWeight[work.provider] ?? 0.8;
      const provenance: ProvenanceRecord = {
        provider: work.provider,
        sourceUrl: work.sourceUrl,
        fetchedAt: new Date().toISOString(),
        confidence
      };

      const baseScore = 0.6 * work.score + 0.3 * scoreFromCitations(work.citationCount) + 0.1 * confidence;

      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          title: work.title,
          abstract: work.abstract,
          year: work.year,
          venue: work.venue,
          doi: normalizeDoi(work.doi),
          url: work.url,
          paperId: work.providerId,
          citationCount: work.citationCount,
          influentialCitationCount: work.influentialCitationCount,
          referenceCount: work.referenceCount,
          authors: work.authors,
          openAccess: {
            isOpenAccess: work.openAccess.isOpenAccess,
            pdfUrl: work.openAccess.pdfUrl,
            license: work.openAccess.license
          },
          externalIds: work.externalIds,
          fieldsOfStudy: work.fieldsOfStudy,
          score: baseScore,
          provenance: [provenance]
        });
        continue;
      }

      existing.abstract = existing.abstract ?? work.abstract;
      existing.year = existing.year ?? work.year;
      existing.venue = existing.venue ?? work.venue;
      existing.url = existing.url ?? work.url;
      existing.doi = existing.doi ?? normalizeDoi(work.doi);
      existing.citationCount = Math.max(existing.citationCount, work.citationCount);
      existing.influentialCitationCount = Math.max(existing.influentialCitationCount, work.influentialCitationCount);
      existing.referenceCount = Math.max(existing.referenceCount, work.referenceCount);
      existing.authors = existing.authors.length > 0 ? existing.authors : work.authors;
      existing.fieldsOfStudy = mergeFields(existing.fieldsOfStudy, work.fieldsOfStudy);
      existing.externalIds = {
        ...work.externalIds,
        ...existing.externalIds
      };
      existing.openAccess = {
        isOpenAccess: existing.openAccess.isOpenAccess || work.openAccess.isOpenAccess,
        pdfUrl: existing.openAccess.pdfUrl ?? work.openAccess.pdfUrl,
        license: existing.openAccess.license ?? work.openAccess.license
      };
      existing.provenance.push(provenance);
      existing.score = Math.max(existing.score, baseScore);
    }

    const sorted = [...merged.values()]
      .sort((a, b) => b.score - a.score || (b.citationCount ?? 0) - (a.citationCount ?? 0))
      .slice(0, input.limit);

    this.logger.debug('Literature graph search complete', {
      query: input.query,
      providers: [...requestedSources],
      mergedCount: sorted.length,
      providerErrors
    });

    return {
      query: input.query,
      totalResults: sorted.length,
      results: sorted,
      providerErrors
    };
  }

  async resolveByDoi(doi: string): Promise<CanonicalWork | null> {
    const normalized = normalizeDoi(doi);
    if (!normalized) {
      return null;
    }

    const result = await this.searchGraph({
      query: normalized,
      limit: 10,
      sources: ['openalex', 'crossref', 'semantic_scholar']
    });

    return (
      result.results.find((item) => normalizeDoi(item.doi) === normalized) ??
      result.results.find((item) => normalizeDoi(item.externalIds.doi) === normalized) ??
      result.results[0] ??
      null
    );
  }

  private async searchWithScholarScrape(query: string, limit: number): Promise<ProviderWork[]> {
    const result = await this.scholarService.searchKeywords({
      query,
      numResults: limit,
      start: 0,
      language: this.config.scholarLanguage
    });

    return result.papers.map((paper) => ({
      provider: 'scholar_scrape',
      providerId: paper.url ?? `scholar:${paper.title}`,
      title: paper.title,
      abstract: paper.abstract || null,
      year: parseYear(paper.year),
      venue: null,
      doi: null,
      url: paper.url,
      citationCount: paper.citedByCount,
      influentialCitationCount: 0,
      referenceCount: 0,
      authors: paper.authorsLine
        .split(',')
        .map((name) => ({ name: name.trim() }))
        .filter((author) => author.name.length > 0),
      openAccess: {
        isOpenAccess: Boolean(paper.pdfUrl),
        pdfUrl: paper.pdfUrl,
        license: null
      },
      externalIds: {},
      fieldsOfStudy: [],
      score: 0.4,
      sourceUrl: result.requestedUrl
    }));
  }
}
