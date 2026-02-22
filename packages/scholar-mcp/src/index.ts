#!/usr/bin/env node

import { config as loadDotEnv } from 'dotenv';
import { parseCliArgs, CLI_USAGE } from './cli/args.js';
import { parseConfig } from './config.js';
import { Logger } from './core/logger.js';
import { startHttpServer } from './http/start-http-server.js';
import { startStdioServer } from './mcp/start-stdio-server.js';
import { ResearchService } from './research/research-service.js';
import { ScholarService } from './scholar/scholar-service.js';
import { getPackageVersion } from './version.js';

loadDotEnv({ quiet: true });

const printStdout = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const printStderr = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

const run = async (): Promise<void> => {
  const cli = parseCliArgs(process.argv.slice(2));

  if (cli.showHelp) {
    printStdout(CLI_USAGE);
    return;
  }

  if (cli.showVersion) {
    printStdout(getPackageVersion());
    return;
  }

  const config = parseConfig(
    cli.transport
      ? {
          SCHOLAR_MCP_TRANSPORT: cli.transport
        }
      : undefined
  );

  const logger = new Logger(config.logLevel);
  const scholarService = ScholarService.fromConfig(config, logger);
  const researchService = ResearchService.fromConfig(config, logger, scholarService);

  switch (config.transport) {
    case 'stdio': {
      await startStdioServer(config, scholarService, researchService, logger);
      return;
    }
    case 'http': {
      startHttpServer(config, scholarService, researchService, logger);
      return;
    }
    case 'both': {
      startHttpServer(config, scholarService, researchService, logger);
      await startStdioServer(config, scholarService, researchService, logger);
      return;
    }
    default: {
      throw new Error(`Unsupported transport mode: ${String(config.transport)}`);
    }
  }
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  printStderr(`ScholarMCP failed to start: ${message}`);
  if (error instanceof Error && error.stack) {
    printStderr(error.stack);
  }
  if (message.includes('Unknown argument') || message.includes('Invalid transport')) {
    printStderr('');
    printStderr(CLI_USAGE);
  }
  process.exitCode = 1;
});
