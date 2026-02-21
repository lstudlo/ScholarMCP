import type { AppConfig } from '../config.js';
import { Logger } from '../core/logger.js';
import { ScholarService } from '../scholar/scholar-service.js';
import { LiteratureService, type LiteratureSearchInput, type LiteratureSearchResult } from './literature-service.js';

export class ResearchService {
  private readonly literatureService: LiteratureService;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly scholarService: ScholarService
  ) {
    this.literatureService = new LiteratureService(config, logger, scholarService);
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
}
