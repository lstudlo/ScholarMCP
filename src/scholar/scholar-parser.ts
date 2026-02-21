import { load } from 'cheerio';
import type {
  ScholarAuthorInfo,
  ScholarAuthorMetrics,
  ScholarAuthorPublication,
  ScholarPaperResult,
  ScholarSearchResult
} from './types.js';

const TEXT_WHITESPACE = /\s+/g;
const YEAR_REGEX = /(?:^|\D)((?:19|20)\d{2})(?:\D|$)/g;
const AUTHOR_ID_REGEX = /[?&]user=([A-Za-z0-9_-]+)/;

const normalizeText = (value: string): string => value.replace(TEXT_WHITESPACE, ' ').trim();

const parseNumber = (value: string): number => {
  const digits = value.replace(/[^\d]/g, '');
  return digits.length === 0 ? 0 : Number.parseInt(digits, 10);
};

const parseNullableNumber = (value: string): number | null => {
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length === 0) {
    return null;
  }
  return Number.parseInt(digits, 10);
};

const resolveUrl = (baseUrl: string, href?: string | null): string | null => {
  if (!href) {
    return null;
  }

  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
};

const extractYear = (input: string): number | null => {
  const years: number[] = [];
  for (const match of input.matchAll(YEAR_REGEX)) {
    const year = match[1];
    if (year) {
      years.push(Number.parseInt(year, 10));
    }
  }

  return years.at(-1) ?? null;
};

const extractAuthorIds = (htmlChunk: string): string[] => {
  const ids = new Set<string>();

  for (const match of htmlChunk.matchAll(/[?&]user=([A-Za-z0-9_-]+)/g)) {
    const authorId = match[1];
    if (!authorId) {
      continue;
    }

    ids.add(authorId);
  }

  return [...ids];
};

const extractAuthorIdsFromElement = ($: ReturnType<typeof load>, selector: string): string[] => {
  const ids = new Set<string>();

  $(selector).each((_, element) => {
    const href = $(element).attr('href');
    if (!href) {
      return;
    }

    const match = href.match(AUTHOR_ID_REGEX);
    if (match) {
      const authorId = match[1];
      if (authorId) {
        ids.add(authorId);
      }
    }
  });

  return [...ids];
};

const parsePaperResult = (baseUrl: string, htmlChunk: string): ScholarPaperResult => {
  const $ = load(htmlChunk);
  const titleAnchor = $('h3.gs_rt a').first();
  const title = normalizeText(titleAnchor.text() || $('h3.gs_rt').first().text());
  const authorsLine = normalizeText($('.gs_a').first().text());
  const abstract = normalizeText($('.gs_rs').first().text());

  let citedByCount = 0;
  let citedByUrl: string | null = null;
  let relatedArticlesUrl: string | null = null;
  let versionsCount = 0;
  let versionsUrl: string | null = null;

  $('.gs_fl a').each((_, link) => {
    const anchor = $(link);
    const text = normalizeText(anchor.text());
    const href = anchor.attr('href');

    if (text.startsWith('Cited by')) {
      citedByCount = parseNumber(text);
      citedByUrl = resolveUrl(baseUrl, href);
      return;
    }

    if (text.startsWith('Related articles')) {
      relatedArticlesUrl = resolveUrl(baseUrl, href);
      return;
    }

    const versionMatch = text.match(/^All\s+(\d+)\s+versions$/i);
    if (versionMatch) {
      const versionCount = versionMatch[1];
      if (versionCount) {
        versionsCount = Number.parseInt(versionCount, 10);
      }
      versionsUrl = resolveUrl(baseUrl, href);
    }
  });

  const authorNode = $('.gs_a').first();

  return {
    title,
    url: resolveUrl(baseUrl, titleAnchor.attr('href')),
    authorsLine,
    abstract,
    year: extractYear(`${authorsLine} ${abstract}`),
    citedByCount,
    citedByUrl,
    relatedArticlesUrl,
    versionsCount,
    versionsUrl,
    pdfUrl: resolveUrl(baseUrl, $('.gs_ggsd a').first().attr('href')),
    authorIds: extractAuthorIds($.html(authorNode) ?? '')
  };
};

export const parseScholarSearchResult = (
  html: string,
  baseUrl: string,
  requestedUrl: string,
  query: string
): ScholarSearchResult => {
  const $ = load(html);
  const resultChunks = $('.gs_r.gs_or.gs_scl')
    .toArray()
    .map((el) => $.html(el))
    .filter((chunk): chunk is string => typeof chunk === 'string');

  const papers = resultChunks.map((chunk) => parsePaperResult(baseUrl, chunk));

  const nextHref = $('#gs_n a')
    .toArray()
    .map((el) => $(el))
    .find((el) => normalizeText(el.text()).toLowerCase().includes('next'))
    ?.attr('href');

  let nextPageStart: number | null = null;
  if (nextHref) {
    try {
      const nextUrl = new URL(nextHref, baseUrl);
      const start = nextUrl.searchParams.get('start');
      nextPageStart = start ? Number.parseInt(start, 10) : null;
    } catch {
      nextPageStart = null;
    }
  }

  const totalResultsText = normalizeText($('#gs_ab_md').first().text()) || null;

  return {
    query,
    requestedUrl,
    totalResultsText,
    nextPageStart,
    papers
  };
};

export const extractAuthorIdsFromSearch = (html: string): string[] => {
  const $ = load(html);
  const ids = new Set<string>();

  $('a[href*="/citations?user="]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) {
      return;
    }

    const match = href.match(AUTHOR_ID_REGEX);
    if (match) {
      const authorId = match[1];
      if (authorId) {
        ids.add(authorId);
      }
    }
  });

  return [...ids];
};

const parseAuthorMetrics = ($: ReturnType<typeof load>): ScholarAuthorMetrics => {
  const rows = $('#gsc_rsb_st tr').toArray();

  let citationsAll: number | null = null;
  let citationsSince: number | null = null;
  let hIndexAll: number | null = null;
  let hIndexSince: number | null = null;
  let i10IndexAll: number | null = null;
  let i10IndexSince: number | null = null;

  rows.forEach((row) => {
    const label = normalizeText($(row).find('td.gsc_rsb_sc1').text()).toLowerCase();
    const values = $(row)
      .find('td.gsc_rsb_std')
      .toArray()
      .map((cell) => normalizeText($(cell).text()));

    if (!label || values.length === 0) {
      return;
    }

    if (label.startsWith('citations')) {
      citationsAll = parseNullableNumber(values[0] ?? '');
      citationsSince = parseNullableNumber(values[1] ?? '');
      return;
    }

    if (label.startsWith('h-index')) {
      hIndexAll = parseNullableNumber(values[0] ?? '');
      hIndexSince = parseNullableNumber(values[1] ?? '');
      return;
    }

    if (label.startsWith('i10-index')) {
      i10IndexAll = parseNullableNumber(values[0] ?? '');
      i10IndexSince = parseNullableNumber(values[1] ?? '');
    }
  });

  return {
    citationsAll,
    citationsSince,
    hIndexAll,
    hIndexSince,
    i10IndexAll,
    i10IndexSince
  };
};

const parseAuthorPublication = (
  $: ReturnType<typeof load>,
  row: Parameters<ReturnType<typeof load>>[0],
  baseUrl: string
): ScholarAuthorPublication => {
  const rowNode = $(row);
  const titleAnchor = rowNode.find('.gsc_a_at').first();
  const metadataRows = rowNode.find('.gs_gray').toArray().map((cell) => normalizeText($(cell).text()));

  return {
    title: normalizeText(titleAnchor.text()),
    detailUrl: resolveUrl(baseUrl, titleAnchor.attr('href')),
    authors: metadataRows[0] ?? '',
    venue: metadataRows[1] ?? '',
    year: parseNullableNumber(
      rowNode.find('.gsc_a_y .gsc_a_h').first().text() || rowNode.find('.gsc_a_y').first().text()
    ),
    citations: parseNumber(rowNode.find('.gsc_a_ac').first().text()),
    citationsUrl: resolveUrl(baseUrl, rowNode.find('.gsc_a_ac').first().attr('href'))
  };
};

export const parseScholarAuthorProfile = (
  html: string,
  baseUrl: string,
  authorId: string,
  maxPublications: number
): ScholarAuthorInfo => {
  const $ = load(html);
  const name = normalizeText($('#gsc_prf_in').text());
  const affiliation = normalizeText($('.gsc_prf_il').first().text()) || null;
  const verifiedLine = normalizeText($('#gsc_prf_ivh').text());
  const verifiedEmailMatch = verifiedLine.match(/Verified email at ([^\s-][^\-]*)/i);

  const publications = $('#gsc_a_b tr.gsc_a_tr')
    .toArray()
    .slice(0, maxPublications)
    .map((row) => parseAuthorPublication($, row, baseUrl));

  const profileAuthorIds = extractAuthorIdsFromElement($, '#gsc_prf_int a, .gs_a a');
  const derivedAuthorId = profileAuthorIds[0] ?? authorId;

  return {
    authorId: derivedAuthorId,
    authorName: name,
    profileUrl: `${baseUrl}/citations?user=${encodeURIComponent(derivedAuthorId)}&hl=en`,
    affiliation,
    verifiedEmail: verifiedEmailMatch?.[1] ? normalizeText(verifiedEmailMatch[1]) : null,
    homepageUrl: resolveUrl(baseUrl, $('#gsc_prf_ivh a').first().attr('href')),
    interests: $('#gsc_prf_int a')
      .toArray()
      .map((el) => normalizeText($(el).text()))
      .filter((interest) => interest.length > 0),
    metrics: parseAuthorMetrics($),
    publications
  };
};

export const parseAuthorName = (html: string): string | null => {
  const $ = load(html);
  const name = normalizeText($('#gsc_prf_in').first().text());
  return name.length > 0 ? name : null;
};
