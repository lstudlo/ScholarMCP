import { z } from 'zod';

export type TransportMode = 'stdio' | 'http' | 'both';

const numberFromEnv = (defaultValue: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(defaultValue);

const booleanFromEnv = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }

    return value;
  }, z.boolean().default(defaultValue));

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
  SCHOLAR_MAX_RESULTS_PER_REQUEST: numberFromEnv(20, 1, 20),
  RESEARCH_OPENALEX_BASE_URL: z.string().url().default('https://api.openalex.org'),
  RESEARCH_OPENALEX_API_KEY: z.string().optional(),
  RESEARCH_CROSSREF_BASE_URL: z.string().url().default('https://api.crossref.org'),
  RESEARCH_SEMANTIC_SCHOLAR_BASE_URL: z.string().url().default('https://api.semanticscholar.org/graph/v1'),
  RESEARCH_SEMANTIC_SCHOLAR_API_KEY: z.string().optional(),
  RESEARCH_TIMEOUT_MS: numberFromEnv(20000, 1000, 120000),
  RESEARCH_RETRY_ATTEMPTS: numberFromEnv(2, 0, 5),
  RESEARCH_RETRY_DELAY_MS: numberFromEnv(800, 0, 30000),
  RESEARCH_REQUEST_DELAY_MS: numberFromEnv(100, 0, 10000),
  RESEARCH_ALLOW_REMOTE_PDFS: booleanFromEnv(true),
  RESEARCH_ALLOW_LOCAL_PDFS: booleanFromEnv(true),
  RESEARCH_GROBID_URL: z.string().url().optional(),
  RESEARCH_PYTHON_SIDECAR_URL: z.string().url().optional(),
  RESEARCH_SEMANTIC_ENGINE: z.enum(['cloud-llm', 'none']).default('cloud-llm'),
  RESEARCH_CLOUD_MODEL: z.string().default('gpt-4.1-mini')
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
  researchOpenAlexBaseUrl: string;
  researchOpenAlexApiKey?: string;
  researchCrossrefBaseUrl: string;
  researchSemanticScholarBaseUrl: string;
  researchSemanticScholarApiKey?: string;
  researchTimeoutMs: number;
  researchRetryAttempts: number;
  researchRetryDelayMs: number;
  researchRequestDelayMs: number;
  researchAllowRemotePdfs: boolean;
  researchAllowLocalPdfs: boolean;
  researchGrobidUrl?: string;
  researchPythonSidecarUrl?: string;
  researchSemanticEngine: 'cloud-llm' | 'none';
  researchCloudModel: string;
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
    scholarMaxResultsPerRequest: env.SCHOLAR_MAX_RESULTS_PER_REQUEST,
    researchOpenAlexBaseUrl: env.RESEARCH_OPENALEX_BASE_URL,
    researchOpenAlexApiKey: env.RESEARCH_OPENALEX_API_KEY,
    researchCrossrefBaseUrl: env.RESEARCH_CROSSREF_BASE_URL,
    researchSemanticScholarBaseUrl: env.RESEARCH_SEMANTIC_SCHOLAR_BASE_URL,
    researchSemanticScholarApiKey: env.RESEARCH_SEMANTIC_SCHOLAR_API_KEY,
    researchTimeoutMs: env.RESEARCH_TIMEOUT_MS,
    researchRetryAttempts: env.RESEARCH_RETRY_ATTEMPTS,
    researchRetryDelayMs: env.RESEARCH_RETRY_DELAY_MS,
    researchRequestDelayMs: env.RESEARCH_REQUEST_DELAY_MS,
    researchAllowRemotePdfs: env.RESEARCH_ALLOW_REMOTE_PDFS,
    researchAllowLocalPdfs: env.RESEARCH_ALLOW_LOCAL_PDFS,
    researchGrobidUrl: env.RESEARCH_GROBID_URL,
    researchPythonSidecarUrl: env.RESEARCH_PYTHON_SIDECAR_URL,
    researchSemanticEngine: env.RESEARCH_SEMANTIC_ENGINE,
    researchCloudModel: env.RESEARCH_CLOUD_MODEL
  };
};
