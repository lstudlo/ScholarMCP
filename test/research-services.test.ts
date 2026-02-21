import { describe, expect, it } from 'vitest';
import { CitationService } from '../src/research/citation-service.js';
import { ExtractionService } from '../src/research/extraction-service.js';
import type { ParsedDocument, ReferenceEntry } from '../src/research/types.js';

const sampleDocument: ParsedDocument = {
  documentId: 'doc_test',
  source: {
    doi: '10.1234/test',
    url: 'https://example.org/paper',
    localPath: null
  },
  parser: {
    parserName: 'pdf-parse',
    parserVersion: '2.x',
    confidence: 0.71
  },
  title: 'A Test Paper',
  abstract: 'This paper evaluates methods.',
  fullText:
    'Abstract We propose a hybrid method. Introduction This paper presents a baseline. Methods Our approach uses a transformer model. Results We show improvements in F1 and accuracy. Limitations However, the dataset size is small. References [1] Doe 2020.',
  sections: [
    {
      id: 'sec_intro',
      heading: 'Introduction',
      text: 'This paper presents a baseline and we propose a hybrid method.',
      pageStart: 1,
      pageEnd: 1
    },
    {
      id: 'sec_methods',
      heading: 'Methods',
      text: 'Our approach uses a transformer model and experimental setup.',
      pageStart: 2,
      pageEnd: 2
    },
    {
      id: 'sec_results',
      heading: 'Results',
      text: 'We show improvements in F1 and accuracy on ABC dataset benchmark.',
      pageStart: 3,
      pageEnd: 3
    },
    {
      id: 'sec_limit',
      heading: 'Limitations',
      text: 'However, this method has limitations due to small data.',
      pageStart: 4,
      pageEnd: 4
    }
  ],
  references: [
    {
      rawText: 'Doe, J. (2020). Prior Work.',
      doi: null,
      title: 'Prior Work',
      year: 2020,
      authors: ['Doe']
    }
  ],
  tables: [],
  equations: [],
  figures: [],
  createdAt: new Date().toISOString(),
  provenance: []
};

describe('extraction-service', () => {
  it('extracts granular details from parsed sections', () => {
    const service = new ExtractionService();
    const result = service.extract(sampleDocument, {
      includeReferences: true
    });

    expect(result.claims.length).toBeGreaterThan(0);
    expect(result.methods.length).toBeGreaterThan(0);
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(result.metrics).toContain('F1'.toUpperCase());
    expect(result.metrics).toContain('ACCURACY');
    expect(result.references).toHaveLength(1);
  });
});

describe('citation-service', () => {
  it('builds bibliography and bibtex from explicit works', async () => {
    const service = new CitationService({
      searchGraph: async () => ({
        query: 'x',
        totalResults: 0,
        providerErrors: [],
        results: []
      })
    } as never);

    const references = await service.buildReferenceList({
      style: 'apa',
      works: [
        {
          title: 'Sample Work',
          abstract: null,
          year: 2023,
          venue: 'TestConf',
          doi: '10.1000/example',
          url: 'https://example.org',
          paperId: 'paper-1',
          citationCount: 10,
          influentialCitationCount: 1,
          referenceCount: 5,
          authors: [{ name: 'Jane Doe' }],
          openAccess: {
            isOpenAccess: true,
            pdfUrl: 'https://example.org/paper.pdf',
            license: 'cc-by'
          },
          externalIds: { doi: '10.1000/example' },
          fieldsOfStudy: ['Computer Science'],
          score: 0.8,
          provenance: []
        }
      ]
    });

    expect(references.references).toHaveLength(1);
    expect(references.bibliographyText.length).toBeGreaterThan(0);
    expect(references.bibtex.toLowerCase()).toContain('@');
  });

  it('validates manuscript citations against references', () => {
    const service = new CitationService({
      searchGraph: async () => ({
        query: 'x',
        totalResults: 0,
        providerErrors: [],
        results: []
      })
    } as never);

    const references: ReferenceEntry[] = [
      {
        id: 'ref-1',
        csl: {},
        formatted: 'Doe, J. (2023). Sample Work.',
        bibtex: '@article{doe2023}',
        sourceWork: {
          title: 'Sample Work',
          abstract: null,
          year: 2023,
          venue: null,
          doi: null,
          url: null,
          paperId: 'p1',
          citationCount: 0,
          influentialCitationCount: 0,
          referenceCount: 0,
          authors: [{ name: 'Jane Doe' }],
          openAccess: { isOpenAccess: false, pdfUrl: null, license: null },
          externalIds: {},
          fieldsOfStudy: [],
          score: 0,
          provenance: []
        }
      }
    ];

    const result = service.validateManuscriptCitations('Prior work supports this claim [1].', references);
    expect(result.inlineCitationCount).toBe(1);
    expect(result.missingReferences).toHaveLength(0);
    expect(result.uncitedReferences).toHaveLength(0);
  });

  it('detects citation range gaps, duplicates, and completeness issues', () => {
    const service = new CitationService({
      searchGraph: async () => ({
        query: 'x',
        totalResults: 0,
        providerErrors: [],
        results: []
      })
    } as never);

    const references: ReferenceEntry[] = [
      {
        id: 'ref-1',
        csl: {},
        formatted: 'Doe, J. (2023). Sample Work.',
        bibtex: '@article{doe2023}',
        sourceWork: {
          title: 'Sample Work',
          abstract: null,
          year: 2023,
          venue: null,
          doi: null,
          url: null,
          paperId: 'p1',
          citationCount: 0,
          influentialCitationCount: 0,
          referenceCount: 0,
          authors: [{ name: 'Jane Doe' }],
          openAccess: { isOpenAccess: false, pdfUrl: null, license: null },
          externalIds: {},
          fieldsOfStudy: [],
          score: 0,
          provenance: []
        }
      },
      {
        id: 'ref-2',
        csl: {},
        formatted: 'Doe, J. (2023). Sample Work.',
        bibtex: '@article{doe2023b}',
        sourceWork: {
          title: 'Sample Work',
          abstract: null,
          year: 2023,
          venue: null,
          doi: null,
          url: null,
          paperId: 'p2',
          citationCount: 0,
          influentialCitationCount: 0,
          referenceCount: 0,
          authors: [{ name: 'Jane Doe' }],
          openAccess: { isOpenAccess: false, pdfUrl: null, license: null },
          externalIds: {},
          fieldsOfStudy: [],
          score: 0,
          provenance: []
        }
      }
    ];

    const result = service.validateManuscriptCitations(
      'Recent studies support this claim [1-3]. Additional context is provided by (Doe, 2023). [TODO]',
      references,
      { style: 'ieee' }
    );

    expect(result.inlineCitationCount).toBe(4);
    expect(result.missingReferences).toContain('[3]');
    expect(result.duplicateReferences.length).toBeGreaterThan(0);
    expect(result.completenessDiagnostics.some((item) => item.missingPersistentIdentifier)).toBe(true);
    expect(result.styleWarnings.some((warning) => warning.includes('Expected numeric citations'))).toBe(true);
    expect(result.styleWarnings).toContain('[TODO]');
  });
});
