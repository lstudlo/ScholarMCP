import type { AppConfig } from '../../config.js';
import { normalizeDoi, parseYear } from '../utils.js';
import { ResearchHttpClient } from '../http-client.js';

export interface ProviderWork {
  provider: 'openalex' | 'crossref' | 'semantic_scholar' | 'scholar_scrape';
  providerId: string;
  title: string;
  abstract: string | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  citationCount: number;
  influentialCitationCount: number;
  referenceCount: number;
  authors: Array<{ name: string; authorId?: string | null }>;
  openAccess: {
    isOpenAccess: boolean;
    pdfUrl: string | null;
    license: string | null;
  };
  externalIds: Record<string, string>;
  fieldsOfStudy: string[];
  score: number;
  sourceUrl: string;
}

interface OpenAlexResponse {
  results?: OpenAlexWork[];
}

interface OpenAlexWork {
  id?: string;
  display_name?: string;
  publication_year?: number;
  primary_location?: {
    source?: { display_name?: string | null } | null;
    landing_page_url?: string | null;
    pdf_url?: string | null;
    license?: string | null;
  } | null;
  open_access?: {
    is_oa?: boolean;
    oa_url?: string | null;
    any_repository_has_fulltext?: boolean;
    oa_status?: string | null;
  } | null;
  abstract_inverted_index?: Record<string, number[]>;
  referenced_works_count?: number;
  cited_by_count?: number;
  ids?: {
    doi?: string | null;
    pmid?: string | null;
    pmcid?: string | null;
    mag?: string | null;
    openalex?: string | null;
  };
  concepts?: Array<{ display_name?: string | null }>;
  authorships?: Array<{
    author?: { id?: string | null; display_name?: string | null } | null;
  }>;
  relevance_score?: number;
}

const decodeInvertedAbstract = (inverted?: Record<string, number[]>): string | null => {
  if (!inverted || Object.keys(inverted).length === 0) {
    return null;
  }

  let max = 0;
  for (const positions of Object.values(inverted)) {
    for (const index of positions) {
      if (index > max) {
        max = index;
      }
    }
  }

  const words = new Array<string>(max + 1).fill('');
  for (const [token, positions] of Object.entries(inverted)) {
    for (const index of positions) {
      words[index] = token;
    }
  }

  const text = words.join(' ').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : null;
};

export class OpenAlexClient {
  constructor(
    private readonly config: AppConfig,
    private readonly httpClient: ResearchHttpClient
  ) {}

  async searchWorks(query: string, limit: number): Promise<ProviderWork[]> {
    const url = new URL('/works', this.config.researchOpenAlexBaseUrl);
    url.searchParams.set('search', query);
    url.searchParams.set('per-page', String(limit));

    if (this.config.researchOpenAlexApiKey) {
      url.searchParams.set('api_key', this.config.researchOpenAlexApiKey);
    }

    const payload = await this.httpClient.fetchJson<OpenAlexResponse>({
      provider: 'openalex',
      url
    });

    return (payload.results ?? []).map((item) => this.mapWork(item, url.toString()));
  }

  async getWorkByDoi(doi: string): Promise<ProviderWork | null> {
    const normalizedDoi = normalizeDoi(doi);
    if (!normalizedDoi) {
      return null;
    }

    const encodedDoiUrl = encodeURIComponent(`https://doi.org/${normalizedDoi}`);
    const url = new URL(`/works/${encodedDoiUrl}`, this.config.researchOpenAlexBaseUrl);

    const payload = await this.httpClient.fetchJson<OpenAlexWork>({
      provider: 'openalex',
      url
    });

    return this.mapWork(payload, url.toString());
  }

  private mapWork(item: OpenAlexWork, sourceUrl: string): ProviderWork {
    const doi = normalizeDoi(item.ids?.doi ?? null);
    return {
      provider: 'openalex',
      providerId: item.id ?? `openalex:${item.display_name ?? 'unknown'}`,
      title: item.display_name ?? 'Untitled',
      abstract: decodeInvertedAbstract(item.abstract_inverted_index),
      year: parseYear(item.publication_year),
      venue: item.primary_location?.source?.display_name ?? null,
      doi,
      url: item.primary_location?.landing_page_url ?? item.id ?? null,
      citationCount: item.cited_by_count ?? 0,
      influentialCitationCount: 0,
      referenceCount: item.referenced_works_count ?? 0,
      authors: (item.authorships ?? [])
        .map((auth) => ({
          name: auth.author?.display_name ?? '',
          authorId: auth.author?.id ?? null
        }))
        .filter((author) => author.name.length > 0),
      openAccess: {
        isOpenAccess:
          item.open_access?.is_oa ?? item.open_access?.any_repository_has_fulltext ?? Boolean(item.primary_location?.pdf_url),
        pdfUrl: item.primary_location?.pdf_url ?? item.open_access?.oa_url ?? null,
        license: item.primary_location?.license ?? item.open_access?.oa_status ?? null
      },
      externalIds: {
        ...(item.ids?.openalex ? { openalex: item.ids.openalex } : {}),
        ...(doi ? { doi } : {}),
        ...(item.ids?.pmid ? { pmid: item.ids.pmid } : {}),
        ...(item.ids?.pmcid ? { pmcid: item.ids.pmcid } : {})
      },
      fieldsOfStudy: (item.concepts ?? [])
        .map((concept) => concept.display_name ?? '')
        .filter((value) => value.length > 0),
      score: item.relevance_score ?? 0.5,
      sourceUrl
    };
  }
}
