import { Cite } from '@citation-js/core';
import '@citation-js/plugin-csl';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-doi';
import type { CanonicalWork, CitationCandidate, CitationStyle, ReferenceEntry } from './types.js';
import { clamp, normalizeDoi, normalizeWhitespace, overlapScore, tokenizeForRanking } from './utils.js';
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

export interface ReferenceCompletenessDiagnostic {
  referenceId: string;
  label: string;
  missingElements: Array<'author' | 'year' | 'title' | 'source'>;
  missingPersistentIdentifier: boolean;
  suggestions: string[];
}

export interface CitationValidationResult {
  inlineCitationCount: number;
  referenceCount: number;
  missingReferences: string[];
  uncitedReferences: string[];
  styleWarnings: string[];
  duplicateReferences: string[];
  completenessDiagnostics: ReferenceCompletenessDiagnostic[];
  normalizationSuggestions: string[];
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

const parseNumericInlineCitations = (manuscriptText: string): { numbers: number[]; invalidChunks: string[] } => {
  const numbers = new Set<number>();
  const invalidChunks: string[] = [];

  for (const match of manuscriptText.matchAll(/\[([^\]]+)\]/g)) {
    const inner = match[1]?.trim() ?? '';
    if (!inner) {
      continue;
    }

    const chunks = inner.split(/[;,]/).map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 0);
    let parsedChunk = false;

    for (const chunk of chunks) {
      const single = chunk.match(/^(\d{1,4})$/);
      if (single?.[1]) {
        numbers.add(Number.parseInt(single[1], 10));
        parsedChunk = true;
        continue;
      }

      const range = chunk.match(/^(\d{1,4})\s*[-–]\s*(\d{1,4})$/);
      if (range?.[1] && range[2]) {
        const start = Number.parseInt(range[1], 10);
        const end = Number.parseInt(range[2], 10);
        if (start <= end && end - start <= 100) {
          for (let value = start; value <= end; value += 1) {
            numbers.add(value);
          }
          parsedChunk = true;
          continue;
        }
      }
    }

    if (!parsedChunk) {
      invalidChunks.push(`[${inner}]`);
    }
  }

  return {
    numbers: [...numbers].sort((a, b) => a - b),
    invalidChunks
  };
};

const parseAuthorYearCitations = (manuscriptText: string): Array<{ author: string; raw: string }> => {
  const citations: Array<{ author: string; raw: string }> = [];

  for (const match of manuscriptText.matchAll(/\(([^()]*?(?:19|20)\d{2}[a-z]?[^()]*)\)/g)) {
    const raw = match[0] ?? '';
    const block = match[1] ?? '';
    const parts = block.split(';').map((value) => normalizeWhitespace(value)).filter((value) => value.length > 0);

    for (const part of parts) {
      const authorMatch = part.match(/^([A-Z][A-Za-z'`\-]+)(?:\s+et al\.)?(?:\s*&\s+[A-Z][A-Za-z'`\-]+)?\s*,\s*(?:19|20)\d{2}[a-z]?/);
      if (!authorMatch?.[1]) {
        continue;
      }

      citations.push({
        author: authorMatch[1],
        raw
      });
    }
  }

  return citations;
};

const findReferenceYear = (reference: ReferenceEntry): number | null => {
  if (reference.sourceWork.year) {
    return reference.sourceWork.year;
  }

  const match = reference.formatted.match(/(?:19|20)\d{2}/);
  return match?.[0] ? Number.parseInt(match[0], 10) : null;
};

const findReferenceTitle = (reference: ReferenceEntry): string | null => {
  const title = normalizeWhitespace(reference.sourceWork.title ?? '');
  if (title.length > 0) {
    return title;
  }

  const parts = reference.formatted.split('.').map((part) => normalizeWhitespace(part));
  const candidate = parts.find((part) => part.length > 10 && !/(?:19|20)\d{2}/.test(part));
  return candidate ?? null;
};

const findReferenceAuthors = (reference: ReferenceEntry): string[] => {
  if (reference.sourceWork.authors.length > 0) {
    return reference.sourceWork.authors.map((author) => author.name).filter((name) => name.length > 0);
  }

  const authorPrefix = normalizeWhitespace(reference.formatted.split('(')[0] ?? '');
  if (authorPrefix.length === 0) {
    return [];
  }

  return authorPrefix
    .split(/,|&| and /i)
    .map((part) => normalizeWhitespace(part))
    .filter((part) => part.length > 0);
};

const findReferenceSource = (reference: ReferenceEntry): string | null => {
  const source = normalizeWhitespace(reference.sourceWork.venue ?? '');
  if (source.length > 0) {
    return source;
  }

  if (reference.sourceWork.url || reference.sourceWork.doi) {
    return reference.sourceWork.url ?? reference.sourceWork.doi ?? null;
  }

  return null;
};

const buildCompletenessDiagnostic = (reference: ReferenceEntry, index: number): ReferenceCompletenessDiagnostic => {
  const missingElements: Array<'author' | 'year' | 'title' | 'source'> = [];
  const suggestions: string[] = [];

  const authors = findReferenceAuthors(reference);
  if (authors.length === 0) {
    missingElements.push('author');
  }

  const year = findReferenceYear(reference);
  if (!year) {
    missingElements.push('year');
  }

  const title = findReferenceTitle(reference);
  if (!title) {
    missingElements.push('title');
  }

  const source = findReferenceSource(reference);
  if (!source) {
    missingElements.push('source');
  }

  const doi = normalizeDoi(reference.sourceWork.doi);
  const hasUrl = Boolean(reference.sourceWork.url);
  const hasPersistentIdentifier = Boolean(doi || hasUrl);

  if (doi && !reference.formatted.toLowerCase().includes('doi.org/')) {
    suggestions.push(`Reference ${index + 1}: include DOI as canonical URL (https://doi.org/${doi}).`);
  }

  if (!hasPersistentIdentifier) {
    suggestions.push(`Reference ${index + 1}: add DOI or stable URL for traceability.`);
  }

  return {
    referenceId: reference.id,
    label: `[${index + 1}] ${reference.formatted}`,
    missingElements,
    missingPersistentIdentifier: !hasPersistentIdentifier,
    suggestions
  };
};

const findDuplicateReferences = (references: ReferenceEntry[]): string[] => {
  const seen = new Map<string, number>();
  const duplicates: string[] = [];

  references.forEach((reference, index) => {
    const doi = normalizeDoi(reference.sourceWork.doi);
    const title = normalizeWhitespace(reference.sourceWork.title ?? reference.formatted)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const year = reference.sourceWork.year ?? findReferenceYear(reference) ?? 'na';

    const key = doi ? `doi:${doi}` : `title:${title}:year:${year}`;
    const previous = seen.get(key);
    if (previous !== undefined) {
      duplicates.push(`Reference ${previous + 1} duplicates reference ${index + 1}.`);
      return;
    }

    seen.set(key, index);
  });

  return duplicates;
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

  validateManuscriptCitations(
    manuscriptText: string,
    references: ReferenceEntry[],
    options?: { style?: CitationStyle }
  ): CitationValidationResult {
    const numericCitationParse = parseNumericInlineCitations(manuscriptText);
    const numericCitations = numericCitationParse.numbers;
    const authorYearCitations = parseAuthorYearCitations(manuscriptText);

    const placeholders = [...manuscriptText.matchAll(/\[(?:\?|TODO|CITATION)\]/gi)].map((match) => match[0] ?? '');

    const missingReferences = new Set<string>();
    for (const value of numericCitations) {
      if (value < 1 || value > references.length) {
        missingReferences.add(`[${value}]`);
      }
    }

    for (const citation of authorYearCitations) {
      const matched = references.some((entry) => entry.formatted.toLowerCase().includes(citation.author.toLowerCase()));
      if (!matched) {
        missingReferences.add(citation.raw);
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

    const completenessDiagnostics = references.map((reference, index) => buildCompletenessDiagnostic(reference, index));
    const normalizationSuggestions = [...new Set(completenessDiagnostics.flatMap((item) => item.suggestions))];

    const styleWarnings = [...placeholders, ...numericCitationParse.invalidChunks];

    if (references.length === 0) {
      styleWarnings.push('Reference list is empty.');
    }

    if (numericCitations.length > 0 && authorYearCitations.length > 0) {
      styleWarnings.push('Mixed numeric and author-year inline citation patterns detected.');
    }

    const expectedStyle = options?.style;
    if (expectedStyle === 'ieee' || expectedStyle === 'vancouver') {
      if (authorYearCitations.length > 0) {
        styleWarnings.push(`Expected numeric citations for ${expectedStyle.toUpperCase()} style.`);
      }
    }

    if (expectedStyle === 'apa' || expectedStyle === 'chicago') {
      if (numericCitations.length > 0) {
        styleWarnings.push(`Expected author-year citations for ${expectedStyle.toUpperCase()} style.`);
      }
    }

    if (expectedStyle === 'apa') {
      const referencesMissingDoiUrl = completenessDiagnostics.filter((item) => item.missingPersistentIdentifier).length;
      if (referencesMissingDoiUrl > 0) {
        styleWarnings.push(
          `${referencesMissingDoiUrl} reference(s) are missing a DOI/URL, which weakens APA traceability requirements.`
        );
      }
    }

    return {
      inlineCitationCount: numericCitations.length + authorYearCitations.length,
      referenceCount: references.length,
      missingReferences: [...missingReferences],
      uncitedReferences,
      styleWarnings,
      duplicateReferences: findDuplicateReferences(references),
      completenessDiagnostics,
      normalizationSuggestions
    };
  }
}
