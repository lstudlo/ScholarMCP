export type ResearchProvider = 'openalex' | 'crossref' | 'semantic_scholar' | 'scholar_scrape';

export type CitationStyle = 'apa' | 'ieee' | 'chicago' | 'vancouver';

export type IngestionStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface ProvenanceRecord {
  provider: ResearchProvider;
  sourceUrl?: string | null;
  fetchedAt: string;
  confidence: number;
  notes?: string;
}

export interface OpenAccessInfo {
  isOpenAccess: boolean;
  license?: string | null;
  pdfUrl?: string | null;
}

export interface CanonicalAuthor {
  name: string;
  authorId?: string | null;
}

export interface CanonicalWork {
  title: string;
  abstract: string | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  paperId: string;
  citationCount: number;
  influentialCitationCount: number;
  referenceCount: number;
  authors: CanonicalAuthor[];
  openAccess: OpenAccessInfo;
  externalIds: Record<string, string>;
  fieldsOfStudy: string[];
  score: number;
  provenance: ProvenanceRecord[];
}

export interface SectionChunk {
  id: string;
  heading: string;
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
}

export interface ParsedReference {
  rawText: string;
  doi: string | null;
  title: string | null;
  year: number | null;
  authors: string[];
}

export interface ParsedDocument {
  documentId: string;
  source: {
    doi: string | null;
    url: string | null;
    localPath: string | null;
  };
  parser: {
    parserName: string;
    parserVersion: string;
    confidence: number;
  };
  title: string | null;
  abstract: string | null;
  fullText: string;
  sections: SectionChunk[];
  references: ParsedReference[];
  tables: string[];
  equations: string[];
  figures: string[];
  createdAt: string;
  provenance: ProvenanceRecord[];
}

export interface IngestionJob {
  jobId: string;
  documentId: string;
  status: IngestionStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  source: {
    doi: string | null;
    paperUrl: string | null;
    pdfUrl: string | null;
    localPdfPath: string | null;
  };
  parserName: string | null;
  parserConfidence: number | null;
  licenseState: 'unknown' | 'open_access' | 'user_provided';
  error: string | null;
  warnings: string[];
  provenance: ProvenanceRecord[];
}

export interface CitationCandidate {
  work: CanonicalWork;
  relevanceScore: number;
  rationale: string;
  matchedContext: string;
}

export interface GranularPaperDetails {
  documentId: string;
  title: string | null;
  abstract: string | null;
  requestedSections: SectionChunk[];
  claims: Array<{ text: string; confidence: number; sectionId: string }>;
  methods: Array<{ text: string; confidence: number; sectionId: string }>;
  limitations: Array<{ text: string; confidence: number; sectionId: string }>;
  datasets: string[];
  metrics: string[];
  references: ParsedReference[];
  parserConfidence: number;
  provenance: ProvenanceRecord[];
}

export interface ReferenceEntry {
  id: string;
  csl: Record<string, unknown>;
  formatted: string;
  bibtex: string;
  sourceWork: CanonicalWork;
}
