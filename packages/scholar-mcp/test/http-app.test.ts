import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config.js';
import { Logger } from '../src/core/logger.js';

const mockState = vi.hoisted(() => ({
  connectCalls: 0,
  closeCalls: 0,
  handleRequestCalls: 0
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  isInitializeRequest: (value: unknown) =>
    typeof value === 'object' &&
    value !== null &&
    'method' in value &&
    (value as { method?: string }).method === 'initialize'
}));

vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
  WebStandardStreamableHTTPServerTransport: class MockWebStandardStreamableHTTPServerTransport {
    sessionId?: string;
    private readonly options: {
      sessionIdGenerator?: () => string;
      onsessioninitialized?: (sessionId: string) => void;
    };

    constructor(options: {
      sessionIdGenerator?: () => string;
      onsessioninitialized?: (sessionId: string) => void;
    }) {
      this.options = options;
    }

    async handleRequest(_request: Request, payload?: { parsedBody?: unknown }) {
      mockState.handleRequestCalls += 1;

      if (!this.sessionId && this.options.sessionIdGenerator) {
        this.sessionId = this.options.sessionIdGenerator();
        this.options.onsessioninitialized?.(this.sessionId);
      }

      const responsePayload = {
        ok: true,
        sessionId: this.sessionId ?? null,
        parsedBody: payload?.parsedBody ?? null
      };

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: this.sessionId ? { 'mcp-session-id': this.sessionId } : undefined
      });
    }

    async close() {
      mockState.closeCalls += 1;
    }
  }
}));

vi.mock('../src/mcp/create-scholar-mcp-server.js', () => ({
  createScholarMcpServer: () => ({
    connect: vi.fn(async () => {
      mockState.connectCalls += 1;
    }),
    close: vi.fn(async () => undefined)
  })
}));

const makeConfig = (overrides?: Parameters<typeof parseConfig>[0]) =>
  parseConfig({
    NODE_ENV: 'test',
    SCHOLAR_MCP_TRANSPORT: 'http',
    ...overrides
  });

const createJsonRequest = (
  input: string,
  init?: Omit<RequestInit, 'body' | 'method'> & { method?: string; body?: unknown }
) =>
  new Request(input, {
    method: init?.method ?? 'POST',
    body: init?.body === undefined ? JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) : JSON.stringify(init.body),
    headers: {
      'content-type': 'application/json',
      host: '127.0.0.1',
      ...(init?.headers ?? {})
    }
  });

describe('createHttpApp', () => {
  beforeEach(() => {
    mockState.closeCalls = 0;
    mockState.connectCalls = 0;
    mockState.handleRequestCalls = 0;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns the transport response in stateless mode and still performs cleanup', async () => {
    const { createHttpApp } = await import('../src/http/start-http-server.js');
    const runtime = createHttpApp(
      makeConfig({ SCHOLAR_MCP_HTTP_SESSION_MODE: 'stateless' }),
      {} as never,
      {} as never,
      new Logger('error')
    );

    const response = await runtime.app.fetch(
      createJsonRequest('http://127.0.0.1/mcp', {
        headers: {
          origin: 'http://127.0.0.1:3000'
        }
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      sessionId: null,
      parsedBody: null
    });
    expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:3000');
    expect(mockState.connectCalls).toBe(1);
    expect(mockState.handleRequestCalls).toBe(1);
    expect(mockState.closeCalls).toBe(1);
  });

  it('requires initialize before creating a stateful session and reuses the session afterward', async () => {
    const { createHttpApp } = await import('../src/http/start-http-server.js');
    const runtime = createHttpApp(makeConfig(), {} as never, {} as never, new Logger('error'));

    const missingSession = await runtime.app.fetch(
      new Request('http://127.0.0.1/mcp', {
        method: 'GET',
        headers: {
          host: '127.0.0.1'
        }
      })
    );

    expect(missingSession.status).toBe(400);

    const initializeResponse = await runtime.app.fetch(createJsonRequest('http://127.0.0.1/mcp'));
    const sessionId = initializeResponse.headers.get('mcp-session-id');

    expect(initializeResponse.status).toBe(200);
    expect(sessionId).toBeTruthy();

    const followUpResponse = await runtime.app.fetch(
      createJsonRequest('http://127.0.0.1/mcp', {
        headers: {
          'mcp-session-id': sessionId as string
        },
        body: { jsonrpc: '2.0', id: 2, method: 'tools/list' }
      })
    );

    expect(followUpResponse.status).toBe(200);
    expect(await followUpResponse.json()).toMatchObject({
      ok: true,
      sessionId
    });
    expect(mockState.connectCalls).toBe(1);
  });

  it('rejects unknown sessions', async () => {
    const { createHttpApp } = await import('../src/http/start-http-server.js');
    const runtime = createHttpApp(makeConfig(), {} as never, {} as never, new Logger('error'));

    const response = await runtime.app.fetch(
      createJsonRequest('http://127.0.0.1/mcp', {
        headers: {
          'mcp-session-id': 'missing-session'
        },
        body: { jsonrpc: '2.0', id: 2, method: 'tools/list' }
      })
    );

    expect(response.status).toBe(404);
  });

  it('handles CORS preflight and host/origin filters', async () => {
    const { createHttpApp } = await import('../src/http/start-http-server.js');
    const runtime = createHttpApp(
      makeConfig({
        SCHOLAR_MCP_ALLOWED_ORIGINS: 'https://allowed.example.com',
        SCHOLAR_MCP_ALLOWED_HOSTS: 'api.example.com'
      }),
      {} as never,
      {} as never,
      new Logger('error')
    );

    const preflight = await runtime.app.fetch(
      new Request('http://127.0.0.1/mcp', {
        method: 'OPTIONS',
        headers: {
          host: 'api.example.com',
          origin: 'https://allowed.example.com'
        }
      })
    );

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://allowed.example.com');

    const badHost = await runtime.app.fetch(
      createJsonRequest('http://127.0.0.1/mcp', {
        headers: {
          host: 'blocked.example.com'
        }
      })
    );

    expect(badHost.status).toBe(403);

    const badOrigin = await runtime.app.fetch(
      createJsonRequest('http://127.0.0.1/mcp', {
        headers: {
          host: 'api.example.com',
          origin: 'https://blocked.example.com'
        }
      })
    );

    expect(badOrigin.status).toBe(403);
  });

  it('enforces bearer auth when configured', async () => {
    const { createHttpApp } = await import('../src/http/start-http-server.js');
    const runtime = createHttpApp(
      makeConfig({
        SCHOLAR_MCP_API_KEY: 'secret-token'
      }),
      {} as never,
      {} as never,
      new Logger('error')
    );

    const unauthorized = await runtime.app.fetch(createJsonRequest('http://127.0.0.1/mcp'));
    expect(unauthorized.status).toBe(401);

    const authorized = await runtime.app.fetch(
      createJsonRequest('http://127.0.0.1/mcp', {
        headers: {
          authorization: 'Bearer secret-token'
        }
      })
    );

    expect(authorized.status).toBe(200);
  });
});
