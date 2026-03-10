import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';

describe('parseConfig', () => {
  it('normalizes paths, csv values, and booleans from overrides', () => {
    const config = parseConfig({
      NODE_ENV: 'test',
      SCHOLAR_MCP_TRANSPORT: 'http',
      SCHOLAR_MCP_ENDPOINT_PATH: 'mcp/',
      SCHOLAR_MCP_HEALTH_PATH: 'health/',
      SCHOLAR_MCP_ALLOWED_ORIGINS: 'https://app.example.com, https://admin.example.com ',
      SCHOLAR_MCP_ALLOWED_HOSTS: 'Example.com:3000, API.EXAMPLE.COM ',
      RESEARCH_ALLOW_REMOTE_PDFS: 'yes',
      RESEARCH_ALLOW_LOCAL_PDFS: 'off'
    });

    expect(config.transport).toBe('http');
    expect(config.endpointPath).toBe('/mcp');
    expect(config.healthPath).toBe('/health');
    expect(config.allowedOrigins).toEqual(['https://app.example.com', 'https://admin.example.com']);
    expect(config.allowedHosts).toEqual(['example.com:3000', 'api.example.com']);
    expect(config.researchAllowRemotePdfs).toBe(true);
    expect(config.researchAllowLocalPdfs).toBe(false);
  });

  it('applies defaults for transport and session settings', () => {
    const config = parseConfig({
      NODE_ENV: 'test'
    });

    expect(config.transport).toBe('stdio');
    expect(config.httpSessionMode).toBe('stateful');
    expect(config.httpSessionTtlMs).toBe(30 * 60 * 1000);
    expect(config.httpMaxSessions).toBe(200);
    expect(config.allowedOrigins).toEqual([]);
    expect(config.allowedHosts).toEqual([]);
  });

  it('rejects out-of-range numeric values', () => {
    expect(() =>
      parseConfig({
        NODE_ENV: 'test',
        SCHOLAR_MCP_PORT: 70000
      })
    ).toThrow();

    expect(() =>
      parseConfig({
        NODE_ENV: 'test',
        RESEARCH_GRAPH_FUZZY_TITLE_THRESHOLD: 0.5
      })
    ).toThrow();
  });
});
