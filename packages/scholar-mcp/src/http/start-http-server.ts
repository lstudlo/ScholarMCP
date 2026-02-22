import { randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { Hono } from 'hono';
import type { AppConfig } from '../config.js';
import { Logger } from '../core/logger.js';
import { createScholarMcpServer } from '../mcp/create-scholar-mcp-server.js';
import type { ResearchService } from '../research/research-service.js';
import type { ScholarService } from '../scholar/scholar-service.js';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

interface SessionRuntime {
  sessionId: string;
  createdAt: number;
  lastSeenAt: number;
  transport: WebStandardStreamableHTTPServerTransport;
  closeServer: () => Promise<void>;
}

interface TransportResolution {
  transport: WebStandardStreamableHTTPServerTransport;
  closeServer: () => Promise<void>;
  parsedBody?: unknown;
  closeAfterRequest: boolean;
  closeIfUninitialized: boolean;
}

interface HttpAppRuntime {
  app: Hono;
  shutdown: () => Promise<void>;
}

const MCP_SESSION_HEADER = 'mcp-session-id';

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
  response.headers.set('Access-Control-Expose-Headers', 'mcp-session-id, MCP-Protocol-Version');
  response.headers.set('Vary', 'Origin');
  return response;
};

const isStale = (runtime: SessionRuntime, now: number, config: AppConfig): boolean =>
  now - runtime.lastSeenAt > config.httpSessionTtlMs;

export const createHttpApp = (
  config: AppConfig,
  service: ScholarService,
  researchService: ResearchService,
  logger: Logger
): HttpAppRuntime => {
  const app = new Hono();
  const sessions = new Map<string, SessionRuntime>();

  const closeSession = async (
    sessionId: string,
    reason: string,
    closeTransport: boolean
  ): Promise<boolean> => {
    const runtime = sessions.get(sessionId);
    if (!runtime) {
      return false;
    }

    sessions.delete(sessionId);

    if (closeTransport) {
      await runtime.transport.close().catch(() => undefined);
    }

    await runtime.closeServer().catch(() => undefined);

    logger.debug('Closed MCP HTTP session', {
      sessionId,
      reason,
      openSessions: sessions.size
    });

    return true;
  };

  const pruneExpiredSessions = async (reason: string): Promise<void> => {
    if (config.httpSessionMode !== 'stateful' || sessions.size === 0) {
      return;
    }

    const now = Date.now();
    const expired = [...sessions.entries()]
      .filter(([, runtime]) => isStale(runtime, now, config))
      .map(([sessionId]) => sessionId);

    await Promise.all(expired.map((sessionId) => closeSession(sessionId, reason, true)));
  };

  const evictOldestSession = async (): Promise<void> => {
    if (sessions.size < config.httpMaxSessions) {
      return;
    }

    let oldestSessionId: string | null = null;
    let oldestSeen = Number.POSITIVE_INFINITY;

    for (const [sessionId, runtime] of sessions.entries()) {
      if (runtime.lastSeenAt < oldestSeen) {
        oldestSeen = runtime.lastSeenAt;
        oldestSessionId = sessionId;
      }
    }

    if (oldestSessionId) {
      await closeSession(oldestSessionId, 'evicted_capacity', true);
      logger.warn('Evicted oldest HTTP MCP session to respect session limit', {
        maxSessions: config.httpMaxSessions,
        evictedSessionId: oldestSessionId
      });
    }
  };

  const createSessionRuntime = async (): Promise<TransportResolution> => {
    await evictOldestSession();

    const server = createScholarMcpServer(config, service, researchService, logger);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (sessionId) => {
        const now = Date.now();
        sessions.set(sessionId, {
          sessionId,
          createdAt: now,
          lastSeenAt: now,
          transport,
          closeServer: async () => server.close().catch(() => undefined)
        });

        logger.debug('Initialized MCP HTTP session', {
          sessionId,
          openSessions: sessions.size
        });
      },
      onsessionclosed: (sessionId) => {
        void closeSession(sessionId, 'client_delete', false);
      }
    });

    await server.connect(transport);

    return {
      transport,
      closeServer: async () => server.close().catch(() => undefined),
      closeAfterRequest: false,
      closeIfUninitialized: true
    };
  };

  const createStatelessRuntime = async (): Promise<TransportResolution> => {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    const server = createScholarMcpServer(config, service, researchService, logger);
    await server.connect(transport);

    return {
      transport,
      closeServer: async () => server.close().catch(() => undefined),
      closeAfterRequest: true,
      closeIfUninitialized: false
    };
  };

  const resolveTransport = async (request: Request): Promise<TransportResolution | Response> => {
    if (config.httpSessionMode === 'stateless') {
      return createStatelessRuntime();
    }

    await pruneExpiredSessions('ttl_expired');

    const method = request.method.toUpperCase();
    const sessionId = request.headers.get(MCP_SESSION_HEADER)?.trim();

    if (sessionId) {
      const runtime = sessions.get(sessionId);
      if (!runtime) {
        return Response.json({ error: 'Session not found' }, { status: 404 });
      }

      runtime.lastSeenAt = Date.now();
      return {
        transport: runtime.transport,
        closeServer: runtime.closeServer,
        closeAfterRequest: false,
        closeIfUninitialized: false
      };
    }

    if (method !== 'POST') {
      return Response.json({ error: 'Missing mcp-session-id header' }, { status: 400 });
    }

    let parsedBody: unknown;
    try {
      parsedBody = await request.clone().json();
    } catch {
      return Response.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    if (!isInitializeRequest(parsedBody)) {
      return Response.json({ error: 'Expected an initialize request when mcp-session-id is absent' }, { status: 400 });
    }

    const runtime = await createSessionRuntime();
    return {
      ...runtime,
      parsedBody
    };
  };

  app.onError((error, c) => {
    logger.error('Unhandled HTTP runtime error', {
      error: error instanceof Error ? error.message : String(error)
    });

    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      },
      500
    );
  });

  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  app.get('/', (c) =>
    c.json({
      name: config.serverName,
      version: config.serverVersion,
      transport: 'streamable-http',
      endpoint: config.endpointPath,
      health: config.healthPath,
      sessionMode: config.httpSessionMode
    })
  );

  app.get(config.healthPath, (c) =>
    c.json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      serverName: config.serverName,
      serverVersion: config.serverVersion,
      transport: 'http',
      sessionMode: config.httpSessionMode,
      openSessions: sessions.size,
      timestamp: new Date().toISOString()
    })
  );

  app.use(config.endpointPath, async (c, next) => {
    const hostHeader = c.req.header('host') ?? '';
    const origin = c.req.header('origin');
    const authorization = c.req.header('authorization');

    if (!isHostAllowed(hostHeader, config)) {
      return attachCorsHeaders(c.json({ error: 'Forbidden host header' }, 403), origin);
    }

    if (!isOriginAllowed(origin, config)) {
      return attachCorsHeaders(c.json({ error: 'Forbidden origin' }, 403), origin);
    }

    if (c.req.method !== 'OPTIONS' && !isAuthorized(authorization, config)) {
      return attachCorsHeaders(c.json({ error: 'Unauthorized' }, 401), origin);
    }

    await next();
  });

  app.options(config.endpointPath, (c) => {
    const origin = c.req.header('origin');
    const response = new Response(null, { status: 204 });
    return attachCorsHeaders(response, origin);
  });

  app.all(config.endpointPath, async (c) => {
    const origin = c.req.header('origin');

    const resolved = await resolveTransport(c.req.raw);
    if (resolved instanceof Response) {
      return attachCorsHeaders(resolved, origin);
    }

    const { transport, parsedBody, closeAfterRequest, closeIfUninitialized, closeServer } = resolved;

    try {
      const response = await transport.handleRequest(c.req.raw, parsedBody === undefined ? undefined : { parsedBody });
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
      if (closeAfterRequest) {
        await transport.close().catch(() => undefined);
        await closeServer();
        return;
      }

      if (closeIfUninitialized && !transport.sessionId) {
        await transport.close().catch(() => undefined);
        await closeServer();
      }
    }
  });

  return {
    app,
    shutdown: async () => {
      await Promise.all(
        [...sessions.keys()].map((sessionId) => closeSession(sessionId, 'server_shutdown', true))
      );
    }
  };
};

export const startHttpServer = (
  config: AppConfig,
  service: ScholarService,
  researchService: ResearchService,
  logger: Logger
) => {
  const runtime = createHttpApp(config, service, researchService, logger);

  const server = serve(
    {
      fetch: runtime.app.fetch,
      port: config.port,
      hostname: config.host
    },
    (info) => {
      logger.info('ScholarMCP HTTP transport listening', {
        host: config.host,
        port: info.port,
        endpoint: config.endpointPath,
        health: config.healthPath,
        sessionMode: config.httpSessionMode
      });
    }
  );

  const shutdown = (signal: string) => {
    logger.info('Shutting down HTTP transport', { signal });
    server.close();
    void runtime.shutdown();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
};
