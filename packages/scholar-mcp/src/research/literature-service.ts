import type { AppConfig } from '../config.js';
import { Logger } from '../core/logger.js';
import { ScholarService } from '../scholar/scholar-service.js';
import type { CanonicalWork, ProvenanceRecord } from './types.js';
import { normalizeDoi, normalizeWhitespace, parseYear, tokenizeForRanking } from './utils.js';
import { ResearchHttpClient } from './http-client.js';
import { ResearchProviderError } from './errors.js';
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

interface CachedSearchResult {
  expiresAt: number;
  value: LiteratureSearchResult;
}

const providerWeight: Record<ProviderWork['provider'], number> = {
  openalex: 1,
  crossref: 0.9,
  semantic_scholar: 1.1,
  scholar_scrape: 0.7
};

const DEFAULT_SOURCES: LiteratureSearchInput['sources'] = ['openalex', 'crossref', 'semantic_scholar'];

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

const tokenSetFromTitle = (title: string): Set<string> => new Set(tokenizeForRanking(title));

const setJaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) {
      overlap += 1;
    }
  }

  return overlap / (a.size + b.size - overlap);
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

const yearsCompatible = (a: number | null, b: number | null): boolean => !a || !b || Math.abs(a - b) <= 2;

const normalizeAuthorName = (name: string): string =>
  normalizeWhitespace(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '');

const sharesAuthorSignal = (
  left: Array<{ name: string; authorId?: string | null }>,
  right: Array<{ name: string; authorId?: string | null }>
): boolean => {
  if (left.length === 0 || right.length === 0) {
    return true;
  }

  const leftIds = new Set(left.map((author) => author.authorId).filter((id): id is string => Boolean(id)));
  if (leftIds.size > 0 && right.some((author) => author.authorId && leftIds.has(author.authorId))) {
    return true;
  }

  const leftNames = new Set(left.map((author) => normalizeAuthorName(author.name)).filter((name) => name.length > 0));
  return right.some((author) => leftNames.has(normalizeAuthorName(author.name)));
};

const cloneResult = <T>(value: T): T => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
};

export class LiteratureService {
  private readonly httpClient: ResearchHttpClient;
  private readonly openAlexClient: OpenAlexClient;
  private readonly crossrefClient: CrossrefClient;
  private readonly semanticScholarClient: SemanticScholarClient;
  private readonly searchCache = new Map<string, CachedSearchResult>();

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
    const requestedSources = new Set(input.sources ?? DEFAULT_SOURCES);
    const cacheKey = this.createCacheKey(input, requestedSources);
    const cached = this.getCache(cacheKey);
    if (cached) {
      this.logger.debug('Returning literature graph result from cache', {
        query: input.query,
        sources: [...requestedSources],
        limit: input.limit
      });
      return cached;
    }

    const providerErrors: Array<{ provider: string; message: string }> = [];
    const providerLimit = Math.max(
      input.limit,
      Math.ceil(input.limit * this.config.researchGraphProviderResultMultiplier)
    );

    const providerPromises: Array<Promise<ProviderWork[]>> = [];

    if (requestedSources.has('openalex')) {
      providerPromises.push(
        this.openAlexClient.searchWorks(input.query, providerLimit).catch((error) => {
          providerErrors.push({ provider: 'openalex', message: error instanceof Error ? error.message : String(error) });
          return [];
        })
      );
    }

    if (requestedSources.has('crossref')) {
      providerPromises.push(
        this.crossrefClient.searchWorks(input.query, providerLimit).catch((error) => {
          providerErrors.push({ provider: 'crossref', message: error instanceof Error ? error.message : String(error) });
          return [];
        })
      );
    }

    if (requestedSources.has('semantic_scholar')) {
      providerPromises.push(
        this.semanticScholarClient.searchWorks(input.query, providerLimit).catch((error) => {
          providerErrors.push({
            provider: 'semantic_scholar',
            message: error instanceof Error ? error.message : String(error)
          });
          return [];
        })
      );
    }

    if (requestedSources.has('scholar_scrape')) {
      providerPromises.push(
        this.searchWithScholarScrape(input.query, providerLimit).catch((error) => {
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
    const doiToKey = new Map<string, string>();
    const titleToKeys = new Map<string, Set<string>>();

    const indexTitle = (titleKey: string, key: string): void => {
      const existing = titleToKeys.get(titleKey) ?? new Set<string>();
      existing.add(key);
      titleToKeys.set(titleKey, existing);
    };

    const resolveTargetKey = (work: ProviderWork): string | null => {
      const normalizedDoi = normalizeDoi(work.doi);
      if (normalizedDoi && doiToKey.has(normalizedDoi)) {
        return doiToKey.get(normalizedDoi) ?? null;
      }

      const titleKey = normalizeTitleKey(work.title);
      const exactCandidateKeys = [...(titleToKeys.get(titleKey) ?? [])];
      for (const key of exactCandidateKeys) {
        const candidate = merged.get(key);
        if (!candidate) {
          continue;
        }

        if (yearsCompatible(candidate.year, work.year) && sharesAuthorSignal(candidate.authors, work.authors)) {
          return key;
        }
      }

      const incomingTokens = tokenSetFromTitle(work.title);
      let bestKey: string | null = null;
      let bestSimilarity = 0;

      for (const [key, candidate] of merged.entries()) {
        if (!yearsCompatible(candidate.year, work.year)) {
          continue;
        }

        if (!sharesAuthorSignal(candidate.authors, work.authors)) {
          continue;
        }

        const similarity = setJaccard(tokenSetFromTitle(candidate.title), incomingTokens);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestKey = key;
        }
      }

      if (bestKey && bestSimilarity >= this.config.researchGraphFuzzyTitleThreshold) {
        return bestKey;
      }

      return null;
    };

    for (const work of filtered) {
      const targetKey = resolveTargetKey(work);
      const normalizedDoi = normalizeDoi(work.doi);
      const titleKey = normalizeTitleKey(work.title);
      const confidence = providerWeight[work.provider] ?? 0.8;
      const provenance: ProvenanceRecord = {
        provider: work.provider,
        sourceUrl: work.sourceUrl,
        fetchedAt: new Date().toISOString(),
        confidence
      };

      const relevanceScore = 0.6 * work.score + 0.3 * scoreFromCitations(work.citationCount) + 0.1 * confidence;

      if (!targetKey) {
        const generatedKey = normalizedDoi ?? `title:${titleKey}:year:${work.year ?? 'na'}`;

        merged.set(generatedKey, {
          title: work.title,
          abstract: work.abstract,
          year: work.year,
          venue: work.venue,
          doi: normalizedDoi,
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
          score: relevanceScore,
          provenance: [provenance]
        });

        if (normalizedDoi) {
          doiToKey.set(normalizedDoi, generatedKey);
        }
        indexTitle(titleKey, generatedKey);
        continue;
      }

      const existing = merged.get(targetKey);
      if (!existing) {
        continue;
      }

      existing.abstract = existing.abstract ?? work.abstract;
      existing.year = existing.year ?? work.year;
      existing.venue = existing.venue ?? work.venue;
      existing.url = existing.url ?? work.url;
      existing.doi = existing.doi ?? normalizedDoi;
      existing.citationCount = Math.max(existing.citationCount, work.citationCount);
      existing.influentialCitationCount = Math.max(existing.influentialCitationCount, work.influentialCitationCount);
      existing.referenceCount = Math.max(existing.referenceCount, work.referenceCount);
      existing.authors = existing.authors.length > 0 ? existing.authors : work.authors;
      existing.fieldsOfStudy = mergeFields(existing.fieldsOfStudy, work.fieldsOfStudy);
      existing.externalIds = {
        ...existing.externalIds,
        ...work.externalIds
      };
      existing.openAccess = {
        isOpenAccess: existing.openAccess.isOpenAccess || work.openAccess.isOpenAccess,
        pdfUrl: existing.openAccess.pdfUrl ?? work.openAccess.pdfUrl,
        license: existing.openAccess.license ?? work.openAccess.license
      };
      existing.provenance.push(provenance);
      existing.score = Math.max(existing.score, relevanceScore);

      const latestDoi = existing.doi ?? normalizedDoi;
      if (latestDoi) {
        doiToKey.set(latestDoi, targetKey);
      }
      indexTitle(titleKey, targetKey);
    }

    const currentYear = new Date().getFullYear();
    const ranked = [...merged.values()]
      .map((work) => {
        const citationScore = scoreFromCitations(work.citationCount);
        const recencyScore = work.year ? 1 / Math.max(1, currentYear - work.year + 1) : 0.15;
        const diversityScore =
          Math.min(1, new Set(work.provenance.map((record) => record.provider)).size / Math.max(1, requestedSources.size));
        const blended =
          0.5 * work.score + 0.25 * citationScore + 0.15 * diversityScore + 0.1 * Math.min(1, recencyScore * 2);

        return {
          ...work,
          score: blended
        };
      })
      .sort((a, b) => b.score - a.score || (b.citationCount ?? 0) - (a.citationCount ?? 0))
      .slice(0, input.limit);

    const result: LiteratureSearchResult = {
      query: input.query,
      totalResults: ranked.length,
      results: ranked,
      providerErrors
    };

    this.setCache(cacheKey, result);

    this.logger.debug('Literature graph search complete', {
      query: input.query,
      providers: [...requestedSources],
      providerLimit,
      mergedCount: ranked.length,
      providerErrors
    });

    return cloneResult(result);
  }

  async resolveByDoi(doi: string): Promise<CanonicalWork | null> {
    const normalized = normalizeDoi(doi);
    if (!normalized) {
      return null;
    }

    try {
      const openAlexExact = await this.openAlexClient.getWorkByDoi(normalized);
      if (openAlexExact) {
        return {
          title: openAlexExact.title,
          abstract: openAlexExact.abstract,
          year: openAlexExact.year,
          venue: openAlexExact.venue,
          doi: openAlexExact.doi,
          url: openAlexExact.url,
          paperId: openAlexExact.providerId,
          citationCount: openAlexExact.citationCount,
          influentialCitationCount: openAlexExact.influentialCitationCount,
          referenceCount: openAlexExact.referenceCount,
          authors: openAlexExact.authors,
          openAccess: {
            isOpenAccess: openAlexExact.openAccess.isOpenAccess,
            pdfUrl: openAlexExact.openAccess.pdfUrl,
            license: openAlexExact.openAccess.license
          },
          externalIds: openAlexExact.externalIds,
          fieldsOfStudy: openAlexExact.fieldsOfStudy,
          score: openAlexExact.score,
          provenance: [
            {
              provider: 'openalex',
              sourceUrl: openAlexExact.sourceUrl,
              fetchedAt: new Date().toISOString(),
              confidence: providerWeight.openalex
            }
          ]
        };
      }
    } catch (error) {
      if (!(error instanceof ResearchProviderError) || error.status !== 404) {
        this.logger.warn('OpenAlex DOI resolve failed', {
          doi: normalized,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const result = await this.searchGraph({
      query: normalized,
      limit: 50,
      sources: ['openalex', 'crossref', 'semantic_scholar']
    });

    return (
      result.results.find((item) => normalizeDoi(item.doi) === normalized) ??
      result.results.find((item) => normalizeDoi(item.externalIds.doi) === normalized) ??
      result.results[0] ??
      null
    );
  }

  private createCacheKey(input: LiteratureSearchInput, sources: Set<string>): string {
    const normalizedFields = (input.fieldsOfStudy ?? []).map((field) => field.trim().toLowerCase()).sort();
    const normalizedSources = [...sources].sort();
    const normalizedYearRange = input.yearRange ? `${input.yearRange[0]}:${input.yearRange[1]}` : 'none';

    return JSON.stringify({
      query: normalizeWhitespace(input.query).toLowerCase(),
      limit: input.limit,
      yearRange: normalizedYearRange,
      fields: normalizedFields,
      sources: normalizedSources
    });
  }

  private getCache(cacheKey: string): LiteratureSearchResult | null {
    if (this.config.researchGraphCacheTtlMs <= 0) {
      return null;
    }

    const cached = this.searchCache.get(cacheKey);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.searchCache.delete(cacheKey);
      return null;
    }

    return cloneResult(cached.value);
  }

  private setCache(cacheKey: string, value: LiteratureSearchResult): void {
    if (this.config.researchGraphCacheTtlMs <= 0) {
      return;
    }

    const now = Date.now();
    for (const [key, cached] of this.searchCache.entries()) {
      if (cached.expiresAt <= now) {
        this.searchCache.delete(key);
      }
    }

    this.searchCache.set(cacheKey, {
      value: cloneResult(value),
      expiresAt: now + this.config.researchGraphCacheTtlMs
    });

    while (this.searchCache.size > this.config.researchGraphMaxCacheEntries) {
      const oldestKey = this.searchCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.searchCache.delete(oldestKey);
    }
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
