import { promises as fs } from 'node:fs';
import { basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { PDFParse } from 'pdf-parse';
import type { AppConfig } from '../config.js';
import { Logger } from '../core/logger.js';
import { IngestionError, DocumentNotFoundError, JobNotFoundError } from './errors.js';
import type { CanonicalWork, IngestionJob, ParsedDocument, ParsedReference, SectionChunk } from './types.js';
import { makeStableId, nowIso, normalizeWhitespace, parseYear } from './utils.js';
import { LiteratureService } from './literature-service.js';

export type ParseMode = 'auto' | 'grobid' | 'simple';

export interface IngestPaperInput {
  doi?: string;
  paperUrl?: string;
  pdfUrl?: string;
  localPdfPath?: string;
  parseMode?: ParseMode;
  ocrEnabled?: boolean;
}

interface ResolvedIngestionSource {
  doi: string | null;
  paperUrl: string | null;
  pdfUrl: string | null;
  localPdfPath: string | null;
  licenseState: IngestionJob['licenseState'];
  provenanceWork: CanonicalWork | null;
}

interface ParseOutput {
  parserName: string;
  parserVersion: string;
  confidence: number;
  title: string | null;
  abstract: string | null;
  fullText: string;
  sections: SectionChunk[];
  references: ParsedReference[];
}

const DOI_REGEX = /10\.\d{4,9}\/[\-._;()/:A-Z0-9]+/i;
const PDF_LINK_REGEX = /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i;

const toAbsolutePath = (value: string): string => (value.startsWith('/') ? value : resolve(process.cwd(), value));

const splitLines = (text: string): string[] => text.split(/\r?\n/).map((line) => line.trim());

const isLikelyHeading = (line: string): boolean =>
  /^(abstract|introduction|background|related work|method(?:s)?|materials|results|discussion|conclusion|limitations|references)\b/i.test(
    line.trim()
  );

const splitIntoSections = (text: string): SectionChunk[] => {
  const lines = splitLines(text).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }

  const sections: SectionChunk[] = [];
  let currentHeading = 'Body';
  let currentLines: string[] = [];

  const pushCurrent = () => {
    const sectionText = normalizeWhitespace(currentLines.join(' '));
    if (sectionText.length === 0) {
      return;
    }

    sections.push({
      id: makeStableId([currentHeading, sectionText.slice(0, 120)], 'section'),
      heading: currentHeading,
      text: sectionText,
      pageStart: null,
      pageEnd: null
    });
  };

  for (const line of lines) {
    if (isLikelyHeading(line) && currentLines.length > 0) {
      pushCurrent();
      currentHeading = line;
      currentLines = [];
      continue;
    }

    if (isLikelyHeading(line) && currentLines.length === 0) {
      currentHeading = line;
      continue;
    }

    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    pushCurrent();
  }

  return sections;
};

const extractReferences = (text: string): ParsedReference[] => {
  const lines = splitLines(text);
  const referencesStart = lines.findIndex((line) => /^references$/i.test(line));
  const sourceLines = referencesStart >= 0 ? lines.slice(referencesStart + 1) : lines.slice(-120);

  return sourceLines
    .filter((line) => line.length > 30)
    .slice(0, 60)
    .map((line) => {
      const doi = line.match(DOI_REGEX)?.[0]?.toLowerCase() ?? null;
      const year = parseYear(line);
      return {
        rawText: line,
        doi,
        title: null,
        year,
        authors: []
      } satisfies ParsedReference;
    });
};

const extractTitleAndAbstract = (text: string): { title: string | null; abstract: string | null } => {
  const lines = splitLines(text).filter((line) => line.length > 0);
  const title = lines[0] ?? null;

  let abstract: string | null = null;
  const abstractIndex = lines.findIndex((line) => /^abstract$/i.test(line) || /^abstract[:\s]/i.test(line));
  if (abstractIndex >= 0) {
    abstract = normalizeWhitespace(lines.slice(abstractIndex, abstractIndex + 6).join(' '));
  }

  return {
    title,
    abstract
  };
};

const parseGrobidXml = (xml: string): ParseOutput => {
  const title = xml.match(/<title[^>]*type="main"[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  const body = xml.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';
  const text = normalizeWhitespace(body.replace(/<[^>]+>/g, ' '));

  const references = [...xml.matchAll(/<biblStruct[\s\S]*?<\/biblStruct>/gim)]
    .slice(0, 120)
    .map((entry) => {
      const raw = normalizeWhitespace(entry[0].replace(/<[^>]+>/g, ' '));
      const doi = entry[0].match(DOI_REGEX)?.[0]?.toLowerCase() ?? null;
      const refTitle = entry[0].match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
      return {
        rawText: raw,
        doi,
        title: refTitle ? normalizeWhitespace(refTitle.replace(/<[^>]+>/g, ' ')) : null,
        year: parseYear(raw),
        authors: []
      } satisfies ParsedReference;
    });

  const normalizedTitle = title ? normalizeWhitespace(title.replace(/<[^>]+>/g, ' ')) : null;
  const sections = splitIntoSections(text);

  return {
    parserName: 'grobid',
    parserVersion: 'service',
    confidence: text.length > 0 ? 0.85 : 0.65,
    title: normalizedTitle,
    abstract: null,
    fullText: text,
    sections,
    references
  };
};

const resolveUrlCandidate = (candidate: string, baseUrl: string): string | null => {
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
};

export class IngestionService {
  private readonly jobs = new Map<string, IngestionJob>();
  private readonly documents = new Map<string, ParsedDocument>();

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly literatureService: LiteratureService
  ) {}

  enqueueIngestion(input: IngestPaperInput): IngestionJob {
    const sourceSeed = [input.doi ?? null, input.paperUrl ?? null, input.pdfUrl ?? null, input.localPdfPath ?? null];
    const documentId = makeStableId(sourceSeed, 'doc');
    const jobId = makeStableId([...sourceSeed, randomUUID()], 'job');

    const job: IngestionJob = {
      jobId,
      documentId,
      status: 'queued',
      createdAt: nowIso(),
      startedAt: null,
      completedAt: null,
      source: {
        doi: input.doi ?? null,
        paperUrl: input.paperUrl ?? null,
        pdfUrl: input.pdfUrl ?? null,
        localPdfPath: input.localPdfPath ?? null
      },
      parserName: null,
      parserConfidence: null,
      licenseState: 'unknown',
      error: null,
      warnings: [],
      provenance: []
    };

    this.jobs.set(jobId, job);

    void this.processJob(jobId, input).catch((error) => {
      const current = this.jobs.get(jobId);
      if (!current) {
        return;
      }

      current.status = 'failed';
      current.completedAt = nowIso();
      current.error = error instanceof Error ? error.message : String(error);
      this.jobs.set(jobId, current);
    });

    return job;
  }

  getJob(jobId: string): IngestionJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    return job;
  }

  getDocument(documentId: string): ParsedDocument {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new DocumentNotFoundError(documentId);
    }

    return document;
  }

  private async processJob(jobId: string, input: IngestPaperInput): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    job.status = 'running';
    job.startedAt = nowIso();
    this.jobs.set(jobId, job);

    const resolved = await this.resolveSource(input);
    job.source = {
      doi: resolved.doi,
      paperUrl: resolved.paperUrl,
      pdfUrl: resolved.pdfUrl,
      localPdfPath: resolved.localPdfPath
    };
    job.licenseState = resolved.licenseState;

    const parserMode = input.parseMode ?? 'auto';
    const parseResult = await this.parseSourcePdf(resolved, parserMode);

    const document: ParsedDocument = {
      documentId: job.documentId,
      source: {
        doi: resolved.doi,
        url: resolved.paperUrl ?? resolved.pdfUrl,
        localPath: resolved.localPdfPath
      },
      parser: {
        parserName: parseResult.parserName,
        parserVersion: parseResult.parserVersion,
        confidence: parseResult.confidence
      },
      title: parseResult.title,
      abstract: parseResult.abstract,
      fullText: parseResult.fullText,
      sections: parseResult.sections,
      references: parseResult.references,
      tables: [],
      equations: [],
      figures: [],
      createdAt: nowIso(),
      provenance: [
        {
          provider: resolved.provenanceWork ? 'openalex' : 'scholar_scrape',
          sourceUrl: resolved.paperUrl ?? resolved.pdfUrl,
          fetchedAt: nowIso(),
          confidence: parseResult.confidence,
          notes: `${parseResult.parserName}:${parseResult.parserVersion}`
        }
      ]
    };

    this.documents.set(document.documentId, document);

    job.status = 'succeeded';
    job.completedAt = nowIso();
    job.parserName = parseResult.parserName;
    job.parserConfidence = parseResult.confidence;
    job.provenance = document.provenance;
    this.jobs.set(jobId, job);
  }

  private async resolveSource(input: IngestPaperInput): Promise<ResolvedIngestionSource> {
    if (input.localPdfPath) {
      if (!this.config.researchAllowLocalPdfs) {
        throw new IngestionError('Local PDF ingestion is disabled by configuration.');
      }

      const absolutePath = toAbsolutePath(input.localPdfPath);
      await fs.access(absolutePath);

      return {
        doi: input.doi ?? null,
        paperUrl: input.paperUrl ?? null,
        pdfUrl: input.pdfUrl ?? null,
        localPdfPath: absolutePath,
        licenseState: 'user_provided',
        provenanceWork: null
      };
    }

    if (!this.config.researchAllowRemotePdfs) {
      throw new IngestionError('Remote PDF ingestion is disabled by configuration.');
    }

    let resolvedWork: CanonicalWork | null = null;
    if (input.doi) {
      resolvedWork = await this.literatureService.resolveByDoi(input.doi);
    }

    const paperUrlCandidate = input.paperUrl ?? resolvedWork?.url ?? null;
    const paperUrlPdfCandidate = paperUrlCandidate?.toLowerCase().endsWith('.pdf') ? paperUrlCandidate : null;
    const discoveredPdfFromLanding = await this.resolvePdfUrlFromLandingPages([paperUrlCandidate, resolvedWork?.url]);

    const resolvedPdfUrl =
      input.pdfUrl ??
      resolvedWork?.openAccess.pdfUrl ??
      paperUrlPdfCandidate ??
      discoveredPdfFromLanding;

    if (!resolvedPdfUrl) {
      throw new IngestionError('Unable to resolve a downloadable PDF URL from input.');
    }

    return {
      doi: input.doi ?? resolvedWork?.doi ?? null,
      paperUrl: input.paperUrl ?? resolvedWork?.url ?? null,
      pdfUrl: resolvedPdfUrl,
      localPdfPath: null,
      licenseState: 'open_access',
      provenanceWork: resolvedWork
    };
  }

  private async parseSourcePdf(source: ResolvedIngestionSource, parseMode: ParseMode): Promise<ParseOutput> {
    const { filePath, cleanup } = await this.obtainPdfFile(source);

    try {
      const modes = this.resolveParserOrder(parseMode);

      for (const mode of modes) {
        try {
          switch (mode) {
            case 'grobid': {
              if (!this.config.researchGrobidUrl) {
                continue;
              }
              return await this.parseWithGrobid(filePath);
            }
            case 'simple': {
              return await this.parseWithSimplePdf(filePath);
            }
          }
        } catch (error) {
          this.logger.warn('Parser mode failed, trying fallback', {
            mode,
            filePath,
            error: error instanceof Error ? error.message : String(error)
          });
          continue;
        }
      }

      throw new IngestionError('All parser strategies failed for this PDF source.');
    } finally {
      await cleanup();
    }
  }

  private resolveParserOrder(parseMode: ParseMode): ParseMode[] {
    if (parseMode === 'auto') {
      return ['grobid', 'simple'];
    }

    if (parseMode === 'grobid') {
      return ['grobid', 'simple'];
    }

    return ['simple'];
  }

  private async obtainPdfFile(source: ResolvedIngestionSource): Promise<{ filePath: string; cleanup: () => Promise<void> }> {
    if (source.localPdfPath) {
      return {
        filePath: source.localPdfPath,
        cleanup: async () => undefined
      };
    }

    if (!source.pdfUrl) {
      throw new IngestionError('Missing PDF URL after source resolution.');
    }

    const response = await fetch(source.pdfUrl, {
      headers: {
        accept: 'application/pdf,*/*',
        'user-agent': 'ScholarMCP/1.0 (+https://github.com/lstudlo/ScholarMCP)'
      }
    });

    if (!response.ok) {
      throw new IngestionError(`Failed to download PDF. HTTP ${response.status}`);
    }

    const bytes = await response.arrayBuffer();
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    const buffer = Buffer.from(bytes);
    const looksLikePdf = buffer.length >= 4 && buffer.subarray(0, 4).toString('utf8') === '%PDF';
    if (!contentType.includes('application/pdf') && !looksLikePdf) {
      throw new IngestionError(
        `Downloaded content is not a PDF (content-type: ${contentType || 'unknown'}).`
      );
    }

    const tempPath = resolve(tmpdir(), `scholar-mcp-${Date.now()}-${randomUUID()}.pdf`);
    await fs.writeFile(tempPath, buffer);

    return {
      filePath: tempPath,
      cleanup: async () => {
        await fs.unlink(tempPath).catch(() => undefined);
      }
    };
  }

  private async parseWithSimplePdf(filePath: string): Promise<ParseOutput> {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    const text = normalizeWhitespace(parsed.text ?? '');

    if (!text) {
      throw new IngestionError('Simple PDF parser returned empty text.');
    }

    const sections = splitIntoSections(parsed.text ?? '');
    const references = extractReferences(parsed.text ?? '');
    const { title, abstract } = extractTitleAndAbstract(parsed.text ?? '');

    return {
      parserName: 'pdf-parse',
      parserVersion: '2.x',
      confidence: 0.62,
      title,
      abstract,
      fullText: text,
      sections,
      references
    };
  }

  private async parseWithGrobid(filePath: string): Promise<ParseOutput> {
    if (!this.config.researchGrobidUrl) {
      throw new IngestionError('GROBID URL is not configured.');
    }

    const url = new URL('/api/processFulltextDocument', this.config.researchGrobidUrl);
    const buffer = await fs.readFile(filePath);
    const formData = new FormData();
    formData.set('input', new Blob([buffer], { type: 'application/pdf' }), basename(filePath));
    formData.set('consolidateHeader', '1');
    formData.set('consolidateCitations', '1');

    const response = await fetch(url, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new IngestionError(`GROBID returned HTTP ${response.status}`);
    }

    const xml = await response.text();
    const parsed = parseGrobidXml(xml);
    if (!parsed.fullText) {
      throw new IngestionError('GROBID response did not include extractable body text.');
    }

    return parsed;
  }

  private async resolvePdfUrlFromLandingPages(urls: Array<string | null | undefined>): Promise<string | null> {
    const seen = new Set<string>();
    for (const candidate of urls) {
      if (!candidate) {
        continue;
      }

      const normalized = candidate.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);

      try {
        const discovered = await this.resolvePdfUrlFromLandingPage(normalized);
        if (discovered) {
          return discovered;
        }
      } catch (error) {
        this.logger.debug('Landing page PDF discovery failed', {
          paperUrl: normalized,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return null;
  }

  private async resolvePdfUrlFromLandingPage(paperUrl: string): Promise<string | null> {
    const response = await fetch(paperUrl, {
      headers: {
        accept: 'text/html,application/pdf,*/*',
        'user-agent': 'ScholarMCP/1.0 (+https://github.com/lstudlo/ScholarMCP)'
      }
    });

    if (!response.ok) {
      return null;
    }

    const finalUrl = response.url || paperUrl;
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (contentType.includes('application/pdf')) {
      return finalUrl;
    }

    const html = await response.text();
    if (!html) {
      return null;
    }

    const metaPatterns = [
      /<meta[^>]+name=["']citation_pdf_url["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']citation_pdf_url["'][^>]*>/i,
      /<meta[^>]+property=["']og:pdf["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:pdf["'][^>]*>/i
    ];

    for (const pattern of metaPatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const resolved = resolveUrlCandidate(match[1], finalUrl);
        if (resolved) {
          return resolved;
        }
      }
    }

    const linkPatterns = [
      /<link[^>]+type=["']application\/pdf["'][^>]+href=["']([^"']+)["'][^>]*>/i,
      /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/pdf["'][^>]*>/i
    ];
    for (const pattern of linkPatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const resolved = resolveUrlCandidate(match[1], finalUrl);
        if (resolved) {
          return resolved;
        }
      }
    }

    const anchorMatch = html.match(PDF_LINK_REGEX);
    if (anchorMatch?.[1]) {
      return resolveUrlCandidate(anchorMatch[1], finalUrl);
    }

    return null;
  }
}
