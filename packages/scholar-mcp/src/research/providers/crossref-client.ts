import type { AppConfig } from '../../config.js';
import { normalizeDoi, parseYear } from '../utils.js';
import { ResearchHttpClient } from '../http-client.js';
import type { ProviderWork } from './openalex-client.js';

interface CrossrefResponse {
  message?: {
    items?: Array<{
      DOI?: string;
      title?: string[];
      abstract?: string;
      issued?: {
        'date-parts'?: number[][];
      };
      published?: {
        'date-parts'?: number[][];
      };
      'container-title'?: string[];
      URL?: string;
      'is-referenced-by-count'?: number;
      reference?: unknown[];
      score?: number;
      author?: Array<{
        given?: string;
        family?: string;
        ORCID?: string;
      }>;
      subject?: string[];
      relation?: Record<string, unknown>;
      license?: Array<{ URL?: string }>;
      link?: Array<{ URL?: string; 'content-type'?: string }>;
    }>;
  };
}

type CrossrefItem = NonNullable<NonNullable<CrossrefResponse['message']>['items']>[number];

const parseCrossrefYear = (item: CrossrefItem): number | null => {
  const fromIssued = item.issued?.['date-parts']?.[0]?.[0];
  if (typeof fromIssued === 'number') {
    return parseYear(fromIssued);
  }

  const fromPublished = item.published?.['date-parts']?.[0]?.[0];
  if (typeof fromPublished === 'number') {
    return parseYear(fromPublished);
  }

  return null;
};

const toPlainAbstract = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }

  const stripped = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped.length > 0 ? stripped : null;
};

export class CrossrefClient {
  constructor(
    private readonly config: AppConfig,
    private readonly httpClient: ResearchHttpClient
  ) {}

  async searchWorks(query: string, limit: number): Promise<ProviderWork[]> {
    const url = new URL('/works', this.config.researchCrossrefBaseUrl);
    url.searchParams.set('query.bibliographic', query);
    url.searchParams.set('rows', String(limit));

    const payload = await this.httpClient.fetchJson<CrossrefResponse>({
      provider: 'crossref',
      url,
      headers: {
        accept: 'application/json'
      }
    });

    return (payload.message?.items ?? []).map((item): ProviderWork => {
      const doi = normalizeDoi(item.DOI ?? null);
      const linkPdf = (item.link ?? []).find((link) => (link['content-type'] ?? '').includes('pdf'))?.URL ?? null;

      return {
        provider: 'crossref',
        providerId: doi ? `doi:${doi}` : `crossref:${item.URL ?? 'unknown'}`,
        title: item.title?.[0] ?? 'Untitled',
        abstract: toPlainAbstract(item.abstract),
        year: parseCrossrefYear(item),
        venue: item['container-title']?.[0] ?? null,
        doi,
        url: item.URL ?? null,
        citationCount: item['is-referenced-by-count'] ?? 0,
        influentialCitationCount: 0,
        referenceCount: item.reference?.length ?? 0,
        authors: (item.author ?? [])
          .map((author) => ({
            name: [author.given ?? '', author.family ?? ''].join(' ').trim(),
            authorId: author.ORCID?.replace('https://orcid.org/', '') ?? null
          }))
          .filter((author) => author.name.length > 0),
        openAccess: {
          isOpenAccess: Boolean(linkPdf),
          pdfUrl: linkPdf,
          license: item.license?.[0]?.URL ?? null
        },
        externalIds: {
          ...(doi ? { doi } : {})
        },
        fieldsOfStudy: item.subject ?? [],
        score: item.score ?? 0.5,
        sourceUrl: url.toString()
      };
    });
  }
}
