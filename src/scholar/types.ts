export interface ScholarPaperResult {
  title: string;
  url: string | null;
  authorsLine: string;
  abstract: string;
  year: number | null;
  citedByCount: number;
  citedByUrl: string | null;
  relatedArticlesUrl: string | null;
  versionsCount: number;
  versionsUrl: string | null;
  pdfUrl: string | null;
  authorIds: string[];
}

export interface ScholarSearchResult {
  query: string;
  requestedUrl: string;
  totalResultsText: string | null;
  nextPageStart: number | null;
  papers: ScholarPaperResult[];
}

export interface ScholarKeywordSearchInput {
  query: string;
  numResults: number;
  start: number;
  language: string;
}

export interface ScholarAdvancedSearchInput {
  query: string;
  author?: string;
  yearRange?: [number, number];
  exactPhrase?: string;
  excludeWords?: string;
  titleOnly?: boolean;
  numResults: number;
  start: number;
  language: string;
}

export interface ScholarAuthorPublication {
  title: string;
  detailUrl: string | null;
  authors: string;
  venue: string;
  year: number | null;
  citations: number;
  citationsUrl: string | null;
}

export interface ScholarAuthorMetrics {
  citationsAll: number | null;
  citationsSince: number | null;
  hIndexAll: number | null;
  hIndexSince: number | null;
  i10IndexAll: number | null;
  i10IndexSince: number | null;
}

export interface ScholarAuthorInfo {
  authorId: string;
  authorName: string;
  profileUrl: string;
  affiliation: string | null;
  verifiedEmail: string | null;
  homepageUrl: string | null;
  interests: string[];
  metrics: ScholarAuthorMetrics;
  publications: ScholarAuthorPublication[];
}
