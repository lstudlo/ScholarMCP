import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { AppConfig } from '../config.js';
import { Logger } from '../core/logger.js';
import { createScholarMcpServer } from './create-scholar-mcp-server.js';
import { ScholarService } from '../scholar/scholar-service.js';

export const startStdioServer = async (
  config: AppConfig,
  service: ScholarService,
  logger: Logger
): Promise<void> => {
  const server = createScholarMcpServer(config, service, logger);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info('ScholarMCP stdio transport ready');
};
