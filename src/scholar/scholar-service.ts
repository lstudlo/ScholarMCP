import type { AppConfig } from '../config.js';
import { Logger } from '../core/logger.js';
import { ScholarParseError } from './errors.js';
import {
  extractAuthorIdsFromSearch,
  parseAuthorName,
  parseScholarAuthorProfile,
  parseScholarSearchResult
} from './scholar-parser.js';
import { ScholarClient } from './scholar-client.js';
import type {
  ScholarAdvancedSearchInput,
  ScholarAuthorInfo,
  ScholarAuthorPublication,
  ScholarKeywordSearchInput,
  ScholarSearchResult
} from './types.js';

const normalizeName = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const nameSimilarity = (requestedName: string, candidateName: string): number => {
  const requested = normalizeName(requestedName);
  const candidate = normalizeName(candidateName);

  if (!requested || !candidate) {
    return 0;
  }

  if (requested === candidate) {
    return 1;
  }

  if (candidate.includes(requested) || requested.includes(candidate)) {
    return 0.9;
  }

  const requestedTokens = new Set(requested.split(' '));
  const candidateTokens = new Set(candidate.split(' '));

  let overlap = 0;
  requestedTokens.forEach((token) => {
    if (candidateTokens.has(token)) {
      overlap += 1;
    }
  });

  return overlap / Math.max(requestedTokens.size, candidateTokens.size, 1);
};

export class ScholarService {
  constructor(
    private readonly client: ScholarClient,
    private readonly config: AppConfig,
    private readonly logger: Logger
  ) {}

  static fromConfig(config: AppConfig, logger: Logger): ScholarService {
    return new ScholarService(new ScholarClient(config), config, logger);
  }

  async searchKeywords(input: ScholarKeywordSearchInput): Promise<ScholarSearchResult> {
    const numResults = clamp(input.numResults, 1, this.config.scholarMaxResultsPerRequest);
    const params = {
      q: input.query,
      hl: input.language,
      as_sdt: '0,5',
      num: numResults,
      start: input.start
    };

    const { html, url } = await this.client.fetchScholarSearch(params);
    const parsed = parseScholarSearchResult(html, this.config.scholarBaseUrl, url, input.query);

    return {
      ...parsed,
      papers: parsed.papers.slice(0, numResults)
    };
  }

  async searchAdvanced(input: ScholarAdvancedSearchInput): Promise<ScholarSearchResult> {
    const numResults = clamp(input.numResults, 1, this.config.scholarMaxResultsPerRequest);

    const params: Record<string, string | number | undefined> = {
      q: input.query,
      hl: input.language,
      as_sdt: '0,5',
      num: numResults,
      start: input.start,
      as_sauthors: input.author,
      as_epq: input.exactPhrase,
      as_eq: input.excludeWords,
      as_occt: input.titleOnly ? 'title' : undefined
    };

    if (input.yearRange) {
      params.as_ylo = input.yearRange[0];
      params.as_yhi = input.yearRange[1];
    }

    const { html, url } = await this.client.fetchScholarSearch(params);
    const parsed = parseScholarSearchResult(html, this.config.scholarBaseUrl, url, input.query);

    return {
      ...parsed,
      papers: parsed.papers.slice(0, numResults)
    };
  }

  async getAuthorInfo(authorName: string, maxPublications: number, language: string): Promise<ScholarAuthorInfo> {
    const publicationLimit = clamp(maxPublications, 1, this.config.scholarMaxResultsPerRequest);

    try {
      const authorId = await this.findBestAuthorId(authorName, language);
      const { html } = await this.client.fetchAuthorProfile(authorId, language);
      return parseScholarAuthorProfile(html, this.config.scholarBaseUrl, authorId, publicationLimit);
    } catch (error) {
      this.logger.warn('Falling back to paper-based author summary', {
        authorName,
        error: error instanceof Error ? error.message : String(error)
      });

      return this.buildAuthorFallback(authorName, publicationLimit, language);
    }
  }

  private async buildAuthorFallback(
    authorName: string,
    maxPublications: number,
    language: string
  ): Promise<ScholarAuthorInfo> {
    const search = await this.searchAdvanced({
      query: authorName,
      author: authorName,
      numResults: maxPublications,
      start: 0,
      language
    });

    const publications: ScholarAuthorPublication[] = search.papers.map((paper) => ({
      title: paper.title,
      detailUrl: paper.url,
      authors: paper.authorsLine,
      venue: paper.authorsLine,
      year: paper.year,
      citations: paper.citedByCount,
      citationsUrl: paper.citedByUrl
    }));

    return {
      authorId: 'unresolved',
      authorName,
      profileUrl: `${this.config.scholarBaseUrl}/scholar?q=${encodeURIComponent(authorName)}`,
      affiliation: null,
      verifiedEmail: null,
      homepageUrl: null,
      interests: [],
      metrics: {
        citationsAll: null,
        citationsSince: null,
        hIndexAll: null,
        hIndexSince: null,
        i10IndexAll: null,
        i10IndexSince: null
      },
      publications
    };
  }

  private async findBestAuthorId(authorName: string, language: string): Promise<string> {
    const candidateIds = new Set<string>();

    const strategies = [
      {
        q: `"${authorName}"`,
        as_sauthors: authorName
      },
      {
        q: `${authorName} research`,
        as_sauthors: authorName
      },
      {
        q: authorName,
        as_sauthors: authorName
      }
    ];

    for (const strategy of strategies) {
      const { html } = await this.client.fetchScholarSearch({
        ...strategy,
        hl: language,
        as_sdt: '0,5',
        num: this.config.scholarMaxResultsPerRequest
      });

      extractAuthorIdsFromSearch(html).forEach((id) => candidateIds.add(id));
      if (candidateIds.size >= 10) {
        break;
      }
    }

    if (candidateIds.size === 0) {
      throw new ScholarParseError(`Unable to discover a Google Scholar profile for "${authorName}".`);
    }

    const limitedCandidates = [...candidateIds].slice(0, 10);
    let bestId: string | null = null;
    let bestScore = 0;

    for (const candidateId of limitedCandidates) {
      try {
        const { html } = await this.client.fetchAuthorProfile(candidateId, language);
        const candidateName = parseAuthorName(html);

        if (!candidateName) {
          continue;
        }

        const score = nameSimilarity(authorName, candidateName);
        this.logger.debug('Evaluated author candidate', {
          requested: authorName,
          candidateId,
          candidateName,
          score
        });

        if (score > bestScore) {
          bestScore = score;
          bestId = candidateId;
        }

        if (score >= 0.98) {
          break;
        }
      } catch {
        continue;
      }
    }

    if (!bestId) {
      throw new ScholarParseError(`Unable to match a Google Scholar profile to "${authorName}".`);
    }

    return bestId;
  }
}
