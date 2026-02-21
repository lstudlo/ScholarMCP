import type { AppConfig } from '../config.js';
import { Logger } from '../core/logger.js';
import { ScholarService } from '../scholar/scholar-service.js';
import { LiteratureService, type LiteratureSearchInput, type LiteratureSearchResult } from './literature-service.js';
import { IngestionService, type IngestPaperInput } from './ingestion-service.js';

export class ResearchService {
  private readonly literatureService: LiteratureService;
  private readonly ingestionService: IngestionService;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly scholarService: ScholarService
  ) {
    this.literatureService = new LiteratureService(config, logger, scholarService);
    this.ingestionService = new IngestionService(config, logger, this.literatureService);
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
}
