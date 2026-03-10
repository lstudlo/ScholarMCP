import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config.js';
import { ResearchProviderError } from '../src/research/errors.js';
import { ResearchHttpClient } from '../src/research/http-client.js';
import { ScholarBlockedError, ScholarFetchError } from '../src/scholar/errors.js';
import { ScholarClient } from '../src/scholar/scholar-client.js';

describe('ResearchHttpClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed json and retries transient failures', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );

    vi.stubGlobal('fetch', fetchMock);

    const client = new ResearchHttpClient(
      parseConfig({
        NODE_ENV: 'test',
        RESEARCH_RETRY_ATTEMPTS: 1,
        RESEARCH_RETRY_DELAY_MS: 0,
        RESEARCH_REQUEST_DELAY_MS: 0
      })
    );

    await expect(client.fetchJson({ provider: 'openalex', url: new URL('https://example.org') })).resolves.toEqual({
      ok: true
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('wraps non-2xx responses in ResearchProviderError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad gateway', { status: 502 }))
    );

    const client = new ResearchHttpClient(
      parseConfig({
        NODE_ENV: 'test',
        RESEARCH_RETRY_ATTEMPTS: 0,
        RESEARCH_REQUEST_DELAY_MS: 0
      })
    );

    await expect(client.fetchJson({ provider: 'openalex', url: new URL('https://example.org') })).rejects.toBeInstanceOf(
      ResearchProviderError
    );
  });
});

describe('ScholarClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches scholar html successfully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>ok</html>', { status: 200, statusText: 'OK' }))
    );

    const client = new ScholarClient(
      parseConfig({
        NODE_ENV: 'test',
        SCHOLAR_REQUEST_DELAY_MS: 0,
        SCHOLAR_RETRY_ATTEMPTS: 0
      })
    );

    await expect(client.fetchScholarSearch({ q: 'graph retrieval' })).resolves.toMatchObject({
      html: '<html>ok</html>',
      url: expect.stringContaining('graph+retrieval')
    });
  });

  it('retries failed scholar requests and surfaces fetch errors', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Response('<html>ok</html>', { status: 200, statusText: 'OK' }));

    vi.stubGlobal('fetch', fetchMock);

    const client = new ScholarClient(
      parseConfig({
        NODE_ENV: 'test',
        SCHOLAR_RETRY_ATTEMPTS: 1,
        SCHOLAR_RETRY_DELAY_MS: 0,
        SCHOLAR_REQUEST_DELAY_MS: 0
      })
    );

    await expect(client.fetchAuthorProfile('AAA111AAAAJ', 'en')).resolves.toMatchObject({
      html: '<html>ok</html>'
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad', { status: 429, statusText: 'Too Many Requests' }))
    );

    await expect(client.fetchScholarSearch({ q: 'retry me' })).rejects.toBeInstanceOf(ScholarFetchError);
  });

  it('detects blocked scholar pages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Detected unusual traffic</html>', { status: 200 }))
    );

    const client = new ScholarClient(
      parseConfig({
        NODE_ENV: 'test',
        SCHOLAR_REQUEST_DELAY_MS: 0,
        SCHOLAR_RETRY_ATTEMPTS: 0
      })
    );

    await expect(client.fetchScholarSearch({ q: 'blocked' })).rejects.toBeInstanceOf(ScholarBlockedError);
  });
});
