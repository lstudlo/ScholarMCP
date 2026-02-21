import { Cite } from '@citation-js/core';
import '@citation-js/plugin-csl';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-doi';
import type { CanonicalWork, CitationCandidate, CitationStyle, ReferenceEntry } from './types.js';
import { clamp, overlapScore, tokenizeForRanking } from './utils.js';
import type { LiteratureService } from './literature-service.js';

export interface SuggestCitationsInput {
  manuscriptText: string;
  cursorContext?: string;
  style: CitationStyle;
  k: number;
  recencyBias: number;
}

export interface SuggestedCitationsResult {
  queryUsed: string;
  suggestions: CitationCandidate[];
  inlineSuggestion: string;
}

export interface BuildReferenceListInput {
  style: CitationStyle;
  locale?: string;
  works?: CanonicalWork[];
  manuscriptText?: string;
}

export interface ReferenceListResult {
  style: CitationStyle;
  locale: string;
  references: ReferenceEntry[];
  bibliographyText: string;
  bibtex: string;
}

export interface CitationValidationResult {
  inlineCitationCount: number;
  referenceCount: number;
  missingReferences: string[];
  uncitedReferences: string[];
  styleWarnings: string[];
}

const styleTemplateMap: Record<CitationStyle, string> = {
  apa: 'apa',
  ieee: 'ieee',
  chicago: 'chicago-author-date',
  vancouver: 'vancouver'
};

const extractQuery = (manuscriptText: string, cursorContext?: string): string => {
  const context = (cursorContext && cursorContext.trim().length > 0 ? cursorContext : manuscriptText).slice(-2500);
  const tokens = tokenizeForRanking(context).filter((token) => token.length > 3);

  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([token]) => token)
    .join(' ')
    .trim();
};

const normalizeStyle = (style: CitationStyle): string => styleTemplateMap[style] ?? 'apa';

const toCsl = (work: CanonicalWork): Record<string, unknown> => {
  const authorList = work.authors.map((author) => {
    const parts = author.name.trim().split(/\s+/);
    const family = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? author.name;
    const given = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';

    return {
      family,
      given
    };
  });

  const id = work.doi ? `doi:${work.doi}` : work.paperId;

  return {
    id,
    type: 'article-journal',
    DOI: work.doi ?? undefined,
    title: work.title,
    author: authorList,
    issued: work.year
      ? {
          'date-parts': [[work.year]]
        }
      : undefined,
    'container-title': work.venue ?? undefined,
    URL: work.url ?? undefined
  };
};

const formatSingleReference = (work: CanonicalWork, style: CitationStyle, locale: string): ReferenceEntry => {
  const csl = toCsl(work);
  const cite = new Cite([csl]);

  let formatted = '';
  try {
    formatted = cite
      .format('bibliography', {
        format: 'text',
        template: normalizeStyle(style),
        lang: locale
      })
      .trim();
  } catch {
    const authorLabel = work.authors[0]?.name ?? 'Unknown';
    const yearLabel = work.year ?? 'n.d.';
    formatted = `${authorLabel} (${yearLabel}). ${work.title}.`;
  }

  let bibtex = '';
  try {
    bibtex = cite.format('bibtex').trim();
  } catch {
    const key = (work.authors[0]?.name ?? 'work').replace(/[^a-zA-Z0-9]/g, '') + (work.year ?? 'nd');
    bibtex = `@article{${key},\n  title={${work.title}},\n  year={${work.year ?? ''}}\n}`;
  }

  return {
    id: String(csl.id ?? work.paperId),
    csl,
    formatted,
    bibtex,
    sourceWork: work
  };
};

const buildInlineSuggestion = (style: CitationStyle, works: CanonicalWork[]): string => {
  const first = works.slice(0, 3);
  if (first.length === 0) {
    return '';
  }

  if (style === 'ieee' || style === 'vancouver') {
    return first.map((_, index) => `[${index + 1}]`).join(', ');
  }

  return first
    .map((work) => {
      const family = work.authors[0]?.name.split(' ').at(-1) ?? 'Unknown';
      const year = work.year ?? 'n.d.';
      return `(${family}, ${year})`;
    })
    .join('; ');
};

export class CitationService {
  constructor(private readonly literatureService: LiteratureService) {}

  async suggestContextualCitations(input: SuggestCitationsInput): Promise<SuggestedCitationsResult> {
    const query = extractQuery(input.manuscriptText, input.cursorContext);
    const fallbackQuery = query.length > 0 ? query : input.manuscriptText.slice(0, 200);

    const graphResult = await this.literatureService.searchGraph({
      query: fallbackQuery,
      limit: clamp(input.k * 3, input.k, 30),
      sources: ['semantic_scholar', 'openalex', 'crossref']
    });

    const contextTokens = tokenizeForRanking(input.cursorContext ?? input.manuscriptText);
    const currentYear = new Date().getFullYear();

    const scored = graphResult.results
      .map((work) => {
        const text = `${work.title} ${work.abstract ?? ''} ${work.fieldsOfStudy.join(' ')}`;
        const overlap = overlapScore(contextTokens, tokenizeForRanking(text));
        const citationScore = Math.log10(work.citationCount + 1) / 4;
        const recencyScore = work.year ? 1 / Math.max(1, currentYear - work.year + 1) : 0.2;
        const finalScore =
          0.55 * overlap +
          0.3 * Math.min(1, citationScore) +
          0.15 * clamp(recencyScore * Math.max(0, input.recencyBias), 0, 1);

        return {
          work,
          relevanceScore: finalScore,
          rationale: `overlap=${overlap.toFixed(2)}, citations=${work.citationCount}, year=${work.year ?? 'n/a'}`,
          matchedContext: (work.abstract ?? work.title).slice(0, 280)
        } satisfies CitationCandidate;
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, input.k);

    return {
      queryUsed: fallbackQuery,
      suggestions: scored,
      inlineSuggestion: buildInlineSuggestion(
        input.style,
        scored.map((candidate) => candidate.work)
      )
    };
  }

  async buildReferenceList(input: BuildReferenceListInput): Promise<ReferenceListResult> {
    const locale = input.locale ?? 'en-US';

    let works = input.works ?? [];
    if (works.length === 0 && input.manuscriptText) {
      const suggestions = await this.suggestContextualCitations({
        manuscriptText: input.manuscriptText,
        style: input.style,
        k: 15,
        recencyBias: 0.6
      });
      works = suggestions.suggestions.map((candidate) => candidate.work);
    }

    const deduped = new Map<string, CanonicalWork>();
    for (const work of works) {
      const key = work.doi ?? work.paperId;
      if (!deduped.has(key)) {
        deduped.set(key, work);
      }
    }

    const entries = [...deduped.values()].map((work) => formatSingleReference(work, input.style, locale));

    const cite = new Cite(entries.map((entry) => entry.csl));
    let bibliographyText = '';
    try {
      bibliographyText = cite
        .format('bibliography', {
          format: 'text',
          template: normalizeStyle(input.style),
          lang: locale
        })
        .trim();
    } catch {
      bibliographyText = entries.map((entry) => entry.formatted).join('\n');
    }

    let bibtex = '';
    try {
      bibtex = cite.format('bibtex').trim();
    } catch {
      bibtex = entries.map((entry) => entry.bibtex).join('\n\n');
    }

    return {
      style: input.style,
      locale,
      references: entries,
      bibliographyText,
      bibtex
    };
  }

  validateManuscriptCitations(manuscriptText: string, references: ReferenceEntry[]): CitationValidationResult {
    const numericCitations = [...manuscriptText.matchAll(/\[(\d{1,3})\]/g)].map((match) => Number.parseInt(match[1] ?? '', 10));
    const authorYearCitations = [...manuscriptText.matchAll(/\(([A-Z][A-Za-z\-]+),\s*(19|20)\d{2}[a-z]?\)/g)].map(
      (match) => ({ author: match[1] ?? '', raw: match[0] ?? '' })
    );

    const placeholders = [...manuscriptText.matchAll(/\[(?:\?|TODO|CITATION)\]/gi)].map((match) => match[0] ?? '');

    const missingReferences: string[] = [];
    if (numericCitations.length > 0) {
      const maxCitation = Math.max(...numericCitations);
      for (let i = 1; i <= maxCitation; i += 1) {
        if (i > references.length) {
          missingReferences.push(`[${i}]`);
        }
      }
    }

    for (const citation of authorYearCitations) {
      const matched = references.some((entry) => entry.formatted.toLowerCase().includes(citation.author.toLowerCase()));
      if (!matched) {
        missingReferences.push(citation.raw);
      }
    }

    const uncitedReferences = references
      .map((entry, index) => ({
        label: `[${index + 1}] ${entry.formatted}`,
        referenced:
          numericCitations.includes(index + 1) ||
          authorYearCitations.some((citation) => entry.formatted.toLowerCase().includes(citation.author.toLowerCase()))
      }))
      .filter((entry) => !entry.referenced)
      .map((entry) => entry.label);

    const styleWarnings = [...placeholders];
    if (references.length === 0) {
      styleWarnings.push('Reference list is empty.');
    }

    return {
      inlineCitationCount: numericCitations.length + authorYearCitations.length,
      referenceCount: references.length,
      missingReferences,
      uncitedReferences,
      styleWarnings
    };
  }
}
