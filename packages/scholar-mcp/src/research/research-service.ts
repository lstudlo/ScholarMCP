import type { AppConfig } from '../config.js';
import { Logger } from '../core/logger.js';
import { ScholarService } from '../scholar/scholar-service.js';
import { CitationService, type BuildReferenceListInput, type ReferenceListResult, type SuggestCitationsInput } from './citation-service.js';
import { ExtractionService, type GranularExtractionInput } from './extraction-service.js';
import { LiteratureService, type LiteratureSearchInput, type LiteratureSearchResult } from './literature-service.js';
import { IngestionService, type IngestPaperInput } from './ingestion-service.js';
import type { CitationStyle, ReferenceEntry } from './types.js';

export class ResearchService {
  private readonly literatureService: LiteratureService;
  private readonly ingestionService: IngestionService;
  private readonly extractionService: ExtractionService;
  private readonly citationService: CitationService;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly scholarService: ScholarService
  ) {
    this.literatureService = new LiteratureService(config, logger, scholarService);
    this.ingestionService = new IngestionService(config, logger, this.literatureService);
    this.extractionService = new ExtractionService();
    this.citationService = new CitationService(this.literatureService);
  }

  static fromConfig(config: AppConfig, logger: Logger, scholarService: ScholarService): ResearchService {
    return new ResearchService(config, logger, scholarService);
  }

  async searchLiteratureGraph(input: LiteratureSearchInput): Promise<LiteratureSearchResult> {
    return this.literatureService.searchGraph(input);
  }

  async resolveWorkByDoi(doi: string) {
    return this.literatureService.resolveByDoi(doi);
  }

  ingestPaperFullText(input: IngestPaperInput) {
    return this.ingestionService.enqueueIngestion(input);
  }

  getIngestionStatus(jobId: string) {
    return this.ingestionService.getJob(jobId);
  }

  getParsedDocument(documentId: string) {
    return this.ingestionService.getDocument(documentId);
  }

  extractGranularPaperDetails(documentId: string, input: GranularExtractionInput) {
    const document = this.ingestionService.getDocument(documentId);
    return this.extractionService.extract(document, input);
  }

  suggestContextualCitations(input: SuggestCitationsInput) {
    return this.citationService.suggestContextualCitations(input);
  }

  buildReferenceList(input: BuildReferenceListInput): Promise<ReferenceListResult> {
    return this.citationService.buildReferenceList(input);
  }

  validateManuscriptCitations(manuscriptText: string, references: ReferenceEntry[], options?: { style?: CitationStyle }) {
    return this.citationService.validateManuscriptCitations(manuscriptText, references, options);
  }
}
