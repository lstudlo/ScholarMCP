import { z } from 'zod';

export type TransportMode = 'stdio' | 'http' | 'both';

const numberFromEnv = (defaultValue: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(defaultValue);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SCHOLAR_MCP_SERVER_NAME: z.string().default('scholar-mcp'),
  SCHOLAR_MCP_SERVER_VERSION: z.string().default('1.0.0'),
  SCHOLAR_MCP_TRANSPORT: z.enum(['stdio', 'http', 'both']).default('stdio'),
  SCHOLAR_MCP_HOST: z.string().default('127.0.0.1'),
  SCHOLAR_MCP_PORT: numberFromEnv(3000, 1, 65535),
  SCHOLAR_MCP_ENDPOINT_PATH: z.string().default('/mcp'),
  SCHOLAR_MCP_HEALTH_PATH: z.string().default('/health'),
  SCHOLAR_MCP_ALLOWED_ORIGINS: z.string().optional(),
  SCHOLAR_MCP_ALLOWED_HOSTS: z.string().optional(),
  SCHOLAR_MCP_API_KEY: z.string().optional(),
  SCHOLAR_BASE_URL: z.string().url().default('https://scholar.google.com'),
  SCHOLAR_LANGUAGE: z.string().default('en'),
  SCHOLAR_TIMEOUT_MS: numberFromEnv(15000, 1000, 120000),
  SCHOLAR_RETRY_ATTEMPTS: numberFromEnv(2, 0, 5),
  SCHOLAR_RETRY_DELAY_MS: numberFromEnv(800, 0, 30000),
  SCHOLAR_REQUEST_DELAY_MS: numberFromEnv(250, 0, 10000),
  SCHOLAR_MAX_RESULTS_PER_REQUEST: numberFromEnv(20, 1, 20)
});

type ParsedEnv = z.infer<typeof envSchema>;

const splitCsv = (value?: string): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const normalizePath = (value: string): string => {
  const withPrefix = value.startsWith('/') ? value : `/${value}`;
  return withPrefix.length > 1 && withPrefix.endsWith('/')
    ? withPrefix.slice(0, -1)
    : withPrefix;
};

export interface AppConfig {
  nodeEnv: ParsedEnv['NODE_ENV'];
  logLevel: ParsedEnv['LOG_LEVEL'];
  serverName: string;
  serverVersion: string;
  transport: TransportMode;
  host: string;
  port: number;
  endpointPath: string;
  healthPath: string;
  allowedOrigins: string[];
  allowedHosts: string[];
  apiKey?: string;
  scholarBaseUrl: string;
  scholarLanguage: string;
  scholarTimeoutMs: number;
  scholarRetryAttempts: number;
  scholarRetryDelayMs: number;
  scholarRequestDelayMs: number;
  scholarMaxResultsPerRequest: number;
}

export const parseConfig = (overrides?: Partial<Record<keyof ParsedEnv, string | number>>): AppConfig => {
  const mergedEnv: Record<string, string | number | undefined> = {
    ...process.env,
    ...(overrides ?? {})
  };

  const env = envSchema.parse(mergedEnv);

  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    serverName: env.SCHOLAR_MCP_SERVER_NAME,
    serverVersion: env.SCHOLAR_MCP_SERVER_VERSION,
    transport: env.SCHOLAR_MCP_TRANSPORT,
    host: env.SCHOLAR_MCP_HOST,
    port: env.SCHOLAR_MCP_PORT,
    endpointPath: normalizePath(env.SCHOLAR_MCP_ENDPOINT_PATH),
    healthPath: normalizePath(env.SCHOLAR_MCP_HEALTH_PATH),
    allowedOrigins: splitCsv(env.SCHOLAR_MCP_ALLOWED_ORIGINS),
    allowedHosts: splitCsv(env.SCHOLAR_MCP_ALLOWED_HOSTS).map((host) => host.toLowerCase()),
    apiKey: env.SCHOLAR_MCP_API_KEY,
    scholarBaseUrl: env.SCHOLAR_BASE_URL,
    scholarLanguage: env.SCHOLAR_LANGUAGE,
    scholarTimeoutMs: env.SCHOLAR_TIMEOUT_MS,
    scholarRetryAttempts: env.SCHOLAR_RETRY_ATTEMPTS,
    scholarRetryDelayMs: env.SCHOLAR_RETRY_DELAY_MS,
    scholarRequestDelayMs: env.SCHOLAR_REQUEST_DELAY_MS,
    scholarMaxResultsPerRequest: env.SCHOLAR_MAX_RESULTS_PER_REQUEST
  };
};
