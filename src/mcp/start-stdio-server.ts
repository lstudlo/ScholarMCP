import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { AppConfig } from '../config.js';
import { Logger } from '../core/logger.js';
import { ResearchService } from '../research/research-service.js';
import { ScholarService } from '../scholar/scholar-service.js';
import { createScholarMcpServer } from './create-scholar-mcp-server.js';

export const startStdioServer = async (
  config: AppConfig,
  service: ScholarService,
  researchService: ResearchService,
  logger: Logger
): Promise<void> => {
  const server = createScholarMcpServer(config, service, researchService, logger);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info('ScholarMCP stdio transport ready');
};
