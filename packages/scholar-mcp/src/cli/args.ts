import type { TransportMode } from '../config.js';

export interface CliArgs {
  showHelp: boolean;
  showVersion: boolean;
  transport?: TransportMode;
}

const TRANSPORT_OPTIONS: TransportMode[] = ['stdio', 'http', 'both'];
const TRANSPORT_SET = new Set<string>(TRANSPORT_OPTIONS);

const isTransportMode = (value: string): value is TransportMode => TRANSPORT_SET.has(value);

const parseTransport = (value: string): TransportMode => {
  const normalized = value.trim().toLowerCase();

  if (!isTransportMode(normalized)) {
    throw new Error(
      `Invalid transport "${value}". Expected one of: ${TRANSPORT_OPTIONS.join(', ')}.`
    );
  }

  return normalized;
};

export const CLI_USAGE = `ScholarMCP MCP server

Usage:
  scholar-mcp [--transport <stdio|http|both>]
  scholar-mcp --help
  scholar-mcp --version

Options:
  --transport <mode>  Override SCHOLAR_MCP_TRANSPORT for this run
  -h, --help          Show help
  -v, --version       Print package version`;

export const parseCliArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {
    showHelp: false,
    showVersion: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]?.trim();

    if (!arg) {
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      args.showHelp = true;
      continue;
    }

    if (arg === '-v' || arg === '--version') {
      args.showVersion = true;
      continue;
    }

    if (arg === '--transport') {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error('Missing value after --transport.');
      }

      args.transport = parseTransport(nextValue);
      index += 1;
      continue;
    }

    if (arg.startsWith('--transport=')) {
      const value = arg.slice('--transport='.length);
      args.transport = parseTransport(value);
      continue;
    }

    throw new Error(`Unknown argument "${arg}".`);
  }

  return args;
};
