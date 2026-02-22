import type { AppConfig } from '../../config.js';
import { normalizeDoi, parseYear } from '../utils.js';
import { ResearchHttpClient } from '../http-client.js';
import type { ProviderWork } from './openalex-client.js';

interface SemanticScholarResponse {
  data?: Array<{
    paperId?: string;
    title?: string;
    abstract?: string;
    year?: number;
    venue?: string;
    externalIds?: Record<string, string>;
    url?: string;
    citationCount?: number;
    influentialCitationCount?: number;
    referenceCount?: number;
    isOpenAccess?: boolean;
    openAccessPdf?: { url?: string; license?: string };
    fieldsOfStudy?: string[];
    authors?: Array<{ authorId?: string; name?: string }>;
  }>;
}

export class SemanticScholarClient {
  constructor(
    private readonly config: AppConfig,
    private readonly httpClient: ResearchHttpClient
  ) {}

  async searchWorks(query: string, limit: number): Promise<ProviderWork[]> {
    const url = new URL('/paper/search', this.config.researchSemanticScholarBaseUrl.endsWith('/')
      ? this.config.researchSemanticScholarBaseUrl
      : `${this.config.researchSemanticScholarBaseUrl}/`);

    url.searchParams.set('query', query);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set(
      'fields',
      'paperId,title,abstract,year,venue,externalIds,url,citationCount,influentialCitationCount,referenceCount,isOpenAccess,openAccessPdf,fieldsOfStudy,authors'
    );

    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.config.researchSemanticScholarApiKey) {
      headers['x-api-key'] = this.config.researchSemanticScholarApiKey;
    }

    const payload = await this.httpClient.fetchJson<SemanticScholarResponse>({
      provider: 'semantic_scholar',
      url,
      headers
    });

    return (payload.data ?? []).map((item): ProviderWork => {
      const doi = normalizeDoi(item.externalIds?.DOI ?? null);
      return {
        provider: 'semantic_scholar',
        providerId: item.paperId ?? `semantic:${item.title ?? 'unknown'}`,
        title: item.title ?? 'Untitled',
        abstract: item.abstract ?? null,
        year: parseYear(item.year),
        venue: item.venue ?? null,
        doi,
        url: item.url ?? null,
        citationCount: item.citationCount ?? 0,
        influentialCitationCount: item.influentialCitationCount ?? 0,
        referenceCount: item.referenceCount ?? 0,
        authors: (item.authors ?? [])
          .map((author) => ({
            name: author.name ?? '',
            authorId: author.authorId ?? null
          }))
          .filter((author) => author.name.length > 0),
        openAccess: {
          isOpenAccess: item.isOpenAccess ?? Boolean(item.openAccessPdf?.url),
          pdfUrl: item.openAccessPdf?.url ?? null,
          license: item.openAccessPdf?.license ?? null
        },
        externalIds: {
          ...(doi ? { doi } : {}),
          ...(item.externalIds ?? {})
        },
        fieldsOfStudy: item.fieldsOfStudy ?? [],
        score: 0.7,
        sourceUrl: url.toString()
      };
    });
  }
}
