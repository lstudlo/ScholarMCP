import { parseConfig, type TransportMode } from './config.js';
import { Logger } from './core/logger.js';
import { startHttpServer } from './http/start-http-server.js';
import { startStdioServer } from './mcp/start-stdio-server.js';
import { ResearchService } from './research/research-service.js';
import { ScholarService } from './scholar/scholar-service.js';

const argTransport = process.argv
  .map((arg) => arg.trim())
  .find((arg) => arg.startsWith('--transport='))
  ?.split('=')[1] as TransportMode | undefined;

const config = parseConfig(
  argTransport
    ? {
        SCHOLAR_MCP_TRANSPORT: argTransport
      }
    : undefined
);

const logger = new Logger(config.logLevel);
const scholarService = ScholarService.fromConfig(config, logger);
const researchService = ResearchService.fromConfig(config, logger, scholarService);

const run = async (): Promise<void> => {
  switch (config.transport) {
    case 'stdio': {
      await startStdioServer(config, scholarService, researchService, logger);
      break;
    }
    case 'http': {
      startHttpServer(config, scholarService, researchService, logger);
      break;
    }
    case 'both': {
      startHttpServer(config, scholarService, researchService, logger);
      await startStdioServer(config, scholarService, researchService, logger);
      break;
    }
    default: {
      throw new Error(`Unsupported transport mode: ${String(config.transport)}`);
    }
  }
};

run().catch((error) => {
  logger.error('ScholarMCP failed to start', {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
});
