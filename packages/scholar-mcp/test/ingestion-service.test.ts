import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config.js';
import { Logger } from '../src/core/logger.js';
import { IngestionError } from '../src/research/errors.js';
import { IngestionService } from '../src/research/ingestion-service.js';

const makeService = (overrides?: Parameters<typeof parseConfig>[0], literatureService?: Partial<Record<string, unknown>>) =>
  new IngestionService(
    parseConfig({
      NODE_ENV: 'test',
      RESEARCH_REQUEST_DELAY_MS: 0,
      RESEARCH_RETRY_DELAY_MS: 0,
      SCHOLAR_REQUEST_DELAY_MS: 0,
      ...overrides
    }),
    new Logger('error'),
    (literatureService ?? {}) as never
  );

describe('IngestionService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('resolves local pdf inputs and respects local/remote toggles', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'scholar-mcp-ingest-'));
    const localPdfPath = join(tempDir, 'paper.pdf');
    writeFileSync(localPdfPath, '%PDF-1.4\n');

    const service = makeService();
    const resolved = await (service as never as { resolveSource: (input: unknown) => Promise<any> }).resolveSource({
      localPdfPath
    });

    expect(resolved).toMatchObject({
      localPdfPath,
      licenseState: 'user_provided'
    });

    const disallowedLocal = makeService({ RESEARCH_ALLOW_LOCAL_PDFS: 'false' });
    await expect(
      (disallowedLocal as never as { resolveSource: (input: unknown) => Promise<any> }).resolveSource({
        localPdfPath
      })
    ).rejects.toBeInstanceOf(IngestionError);

    const disallowedRemote = makeService({ RESEARCH_ALLOW_REMOTE_PDFS: 'false' });
    await expect(
      (disallowedRemote as never as { resolveSource: (input: unknown) => Promise<any> }).resolveSource({
        doi: '10.1000/example'
      })
    ).rejects.toBeInstanceOf(IngestionError);

    await rm(tempDir, { recursive: true, force: true });
  });

  it('resolves DOI, landing page, and direct pdf candidates in the expected order', async () => {
    const literatureService = {
      resolveByDoi: vi.fn(async () => ({
        doi: '10.1000/example',
        url: 'https://example.org/landing',
        openAccess: {
          pdfUrl: 'https://example.org/open-access.pdf'
        }
      }))
    };
    const service = makeService(undefined, literatureService);
    const landingSpy = vi
      .spyOn(service as never, 'resolvePdfUrlFromLandingPages')
      .mockResolvedValue('https://example.org/discovered.pdf');

    const resolved = await (service as never as { resolveSource: (input: unknown) => Promise<any> }).resolveSource({
      doi: '10.1000/example'
    });

    expect(resolved.pdfUrl).toBe('https://example.org/open-access.pdf');
    expect(landingSpy).toHaveBeenCalled();

    const direct = await (service as never as { resolveSource: (input: unknown) => Promise<any> }).resolveSource({
      paperUrl: 'https://example.org/direct.pdf',
      pdfUrl: 'https://example.org/manual.pdf'
    });
    expect(direct.pdfUrl).toBe('https://example.org/manual.pdf');
  });

  it('discovers pdf urls from landing pages and direct pdf responses', async () => {
    const service = makeService();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          '<meta name="citation_pdf_url" content="/paper.pdf"><a href="/fallback.pdf">PDF</a>',
          {
            status: 200,
            headers: { 'content-type': 'text/html' }
          }
        )
      )
      .mockResolvedValueOnce(new Response('', { status: 200, headers: { 'content-type': 'application/pdf' } }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      (service as never as { resolvePdfUrlFromLandingPage: (url: string) => Promise<string | null> }).resolvePdfUrlFromLandingPage(
        'https://example.org/article'
      )
    ).resolves.toBe('https://example.org/paper.pdf');

    await expect(
      (service as never as { resolvePdfUrlFromLandingPage: (url: string) => Promise<string | null> }).resolvePdfUrlFromLandingPage(
        'https://example.org/direct-pdf'
      )
    ).resolves.toBe('https://example.org/direct-pdf');
  });

  it('downloads pdf files and rejects non-pdf content', async () => {
    const service = makeService();
    const pdfBytes = Buffer.from('%PDF-1.4 sample');

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(pdfBytes, {
            status: 200,
            headers: { 'content-type': 'application/pdf' }
          })
        )
        .mockResolvedValueOnce(
          new Response('<html>nope</html>', {
            status: 200,
            headers: { 'content-type': 'text/html' }
          })
        )
    );

    const downloaded = await (service as never as { obtainPdfFile: (source: unknown) => Promise<any> }).obtainPdfFile({
      pdfUrl: 'https://example.org/paper.pdf'
    });

    expect(String(await readFile(downloaded.filePath))).toContain('%PDF-1.4');
    await downloaded.cleanup();

    await expect(
      (service as never as { obtainPdfFile: (source: unknown) => Promise<any> }).obtainPdfFile({
        pdfUrl: 'https://example.org/not-pdf'
      })
    ).rejects.toBeInstanceOf(IngestionError);
  });

  it('falls back from grobid to the simple parser and persists successful jobs', async () => {
    const service = makeService({ RESEARCH_GROBID_URL: 'https://grobid.example.com' });
    const tempDir = mkdtempSync(join(tmpdir(), 'scholar-mcp-parse-'));
    const filePath = join(tempDir, 'paper.pdf');
    writeFileSync(filePath, '%PDF-1.4\n');

    vi.spyOn(service as never, 'obtainPdfFile').mockResolvedValue({
      filePath,
      cleanup: async () => undefined
    });
    vi.spyOn(service as never, 'parseWithGrobid').mockRejectedValue(new Error('grobid unavailable'));
    vi.spyOn(service as never, 'parseWithSimplePdf').mockResolvedValue({
      parserName: 'pdf-parse',
      parserVersion: '2.x',
      confidence: 0.62,
      title: 'Parsed Paper',
      abstract: 'Abstract',
      fullText: 'Full text',
      sections: [],
      references: []
    });

    await expect(
      (service as never as { parseSourcePdf: (source: unknown, mode: 'auto') => Promise<any> }).parseSourcePdf(
        { pdfUrl: 'https://example.org/paper.pdf' },
        'auto'
      )
    ).resolves.toMatchObject({
      parserName: 'pdf-parse'
    });

    vi.spyOn(service as never, 'resolveSource').mockResolvedValue({
      doi: '10.1000/example',
      paperUrl: 'https://example.org/landing',
      pdfUrl: 'https://example.org/paper.pdf',
      localPdfPath: null,
      licenseState: 'open_access',
      provenanceWork: {
        url: 'https://example.org/landing'
      }
    });
    vi.spyOn(service as never, 'parseSourcePdf').mockResolvedValue({
      parserName: 'pdf-parse',
      parserVersion: '2.x',
      confidence: 0.8,
      title: 'Parsed Paper',
      abstract: 'Abstract',
      fullText: 'Full text',
      sections: [],
      references: []
    });

    const job = service.enqueueIngestion({ doi: '10.1000/example' });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));

    const completed = service.getJob(job.jobId);
    expect(completed.status).toBe('succeeded');
    expect(service.getDocument(job.documentId)).toMatchObject({
      title: 'Parsed Paper'
    });

    await rm(tempDir, { recursive: true, force: true });
  });

  it('marks failed jobs when processing throws', async () => {
    const service = makeService();
    vi.spyOn(service as never, 'resolveSource').mockRejectedValue(new Error('bad source'));

    const job = service.enqueueIngestion({ doi: '10.1000/example' });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));

    expect(service.getJob(job.jobId)).toMatchObject({
      status: 'failed',
      error: 'bad source'
    });
  });
});
