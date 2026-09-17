import { serve } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config.js';
import { Logger } from '../src/core/logger.js';
import { createHttpApp } from '../src/http/start-http-server.js';

describe('MCP HTTP integration with the real SDK', () => {
  it.each(['stateful', 'stateless'] as const)('initializes, lists schemas, and calls tools in %s mode', async (mode) => {
    const searchAdvanced = vi.fn(async () => ({ query: 'paper', totalResultsText: '0', nextPageStart: null, papers: [] }));
    const config = parseConfig({ NODE_ENV: 'test', SCHOLAR_MCP_HTTP_SESSION_MODE: mode });
    const runtime = createHttpApp(config, { searchAdvanced } as never, {} as never, new Logger('error'));
    let listening!: (port: number) => void;
    const port = new Promise<number>(resolve => { listening = resolve; });
    const server = serve({ fetch: runtime.app.fetch, hostname: '127.0.0.1', port: 0 }, info => listening(info.port));
    const client = new Client({ name: 'release-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${await port}/mcp`));
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(10);
      const search = tools.find(tool => tool.name === 'search_google_scholar_advanced');
      expect(search?.inputSchema.properties?.year_range).toMatchObject({ type: 'object' });
      const result = await client.callTool({ name: 'search_google_scholar_advanced',
        arguments: { query: 'paper', year_range: { start: 2020, end: 2024 } } });
      expect(result.isError).not.toBe(true);
      expect(searchAdvanced).toHaveBeenCalledWith(expect.objectContaining({ yearRange: [2020, 2024] }));
      searchAdvanced.mockClear();
      const invalid = await client.callTool({ name: 'search_google_scholar_advanced',
        arguments: { query: 'paper', year_range: { start: 2024, end: 2020 } } });
      expect(invalid.isError).toBe(true);
      expect(searchAdvanced).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await runtime.shutdown();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
