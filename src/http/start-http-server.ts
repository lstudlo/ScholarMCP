import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { AppConfig } from '../config.js';
import { Logger } from '../core/logger.js';
import { createScholarMcpServer } from '../mcp/create-scholar-mcp-server.js';
import { ResearchService } from '../research/research-service.js';
import { ScholarService } from '../scholar/scholar-service.js';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

const normalizeHostHeader = (hostHeader: string): { full: string; hostname: string } => {
  const normalized = hostHeader.trim().toLowerCase();
  const withoutPort = normalized.startsWith('[')
    ? normalized.replace(/^\[([^\]]+)\](?::\d+)?$/, '$1')
    : normalized.replace(/:\d+$/, '');

  return {
    full: normalized,
    hostname: withoutPort
  };
};

const isLoopbackOrigin = (origin: string): boolean => {
  try {
    const parsed = new URL(origin);
    return LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const isHostAllowed = (hostHeader: string, config: AppConfig): boolean => {
  if (!hostHeader) {
    return false;
  }

  const host = normalizeHostHeader(hostHeader);

  if (config.allowedHosts.length > 0) {
    return config.allowedHosts.includes(host.full) || config.allowedHosts.includes(host.hostname);
  }

  if (LOCAL_HOSTS.has(config.host.toLowerCase())) {
    return LOCAL_HOSTS.has(host.hostname);
  }

  return true;
};

const isOriginAllowed = (origin: string | undefined, config: AppConfig): boolean => {
  if (!origin) {
    return true;
  }

  if (config.allowedOrigins.length > 0) {
    return config.allowedOrigins.includes(origin);
  }

  if (LOCAL_HOSTS.has(config.host.toLowerCase())) {
    return isLoopbackOrigin(origin);
  }

  return true;
};

const isAuthorized = (authorization: string | undefined, config: AppConfig): boolean => {
  if (!config.apiKey) {
    return true;
  }

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return false;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 && token === config.apiKey;
};

const attachCorsHeaders = (response: Response, origin: string | undefined): Response => {
  if (!origin) {
    return response;
  }

  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, mcp-session-id, MCP-Protocol-Version, Last-Event-ID'
  );
  response.headers.set('Vary', 'Origin');
  return response;
};

export const createHttpApp = (
  config: AppConfig,
  service: ScholarService,
  researchService: ResearchService,
  logger: Logger
): Hono => {
  const app = new Hono();

  app.get('/', (c) =>
    c.json({
      name: config.serverName,
      version: config.serverVersion,
      transport: 'streamable-http',
      endpoint: config.endpointPath,
      health: config.healthPath
    })
  );

  app.get(config.healthPath, (c) =>
    c.json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      serverName: config.serverName,
      serverVersion: config.serverVersion,
      transport: 'http',
      timestamp: new Date().toISOString()
    })
  );

  app.options(config.endpointPath, (c) => {
    const hostHeader = c.req.header('host') ?? '';
    const origin = c.req.header('origin');

    if (!isHostAllowed(hostHeader, config) || !isOriginAllowed(origin, config)) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const response = new Response(null, { status: 204 });
    return attachCorsHeaders(response, origin);
  });

  app.all(config.endpointPath, async (c) => {
    const hostHeader = c.req.header('host') ?? '';
    const origin = c.req.header('origin');
    const authorization = c.req.header('authorization');

    if (!isHostAllowed(hostHeader, config)) {
      return c.json({ error: 'Forbidden host header' }, 403);
    }

    if (!isOriginAllowed(origin, config)) {
      return c.json({ error: 'Forbidden origin' }, 403);
    }

    if (!isAuthorized(authorization, config)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    const server = createScholarMcpServer(config, service, researchService, logger);

    try {
      await server.connect(transport);
      const response = await transport.handleRequest(c.req.raw);
      return attachCorsHeaders(response, origin);
    } catch (error) {
      logger.error('MCP HTTP request handling failed', {
        error: error instanceof Error ? error.message : String(error)
      });

      const response = Response.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error'
          },
          id: null
        },
        { status: 500 }
      );

      return attachCorsHeaders(response, origin);
    } finally {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  });

  return app;
};

export const startHttpServer = (
  config: AppConfig,
  service: ScholarService,
  researchService: ResearchService,
  logger: Logger
) => {
  const app = createHttpApp(config, service, researchService, logger);

  const server = serve(
    {
      fetch: app.fetch,
      port: config.port,
      hostname: config.host
    },
    (info) => {
      logger.info('ScholarMCP HTTP transport listening', {
        host: config.host,
        port: info.port,
        endpoint: config.endpointPath,
        health: config.healthPath
      });
    }
  );

  const shutdown = (signal: string) => {
    logger.info('Shutting down HTTP transport', { signal });
    server.close();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
};
