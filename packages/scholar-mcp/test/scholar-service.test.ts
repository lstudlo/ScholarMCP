import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config.js';
import { Logger } from '../src/core/logger.js';
import { ScholarService } from '../src/scholar/scholar-service.js';

const fixture = (name: string) => readFileSync(resolve(process.cwd(), 'test', 'fixtures', name), 'utf8');

describe('ScholarService', () => {
  it('clamps keyword search results to the configured maximum', async () => {
    const client = {
      fetchScholarSearch: vi.fn(async () => ({
        html: fixture('scholar-search.html'),
        url: 'https://scholar.google.com/scholar?q=test'
      }))
    };

    const service = new ScholarService(
      client as never,
      parseConfig({
        NODE_ENV: 'test',
        SCHOLAR_MAX_RESULTS_PER_REQUEST: 1
      }),
      new Logger('error')
    );

    const result = await service.searchKeywords({
      query: 'test',
      numResults: 5,
      start: 0,
      language: 'en'
    });

    expect(client.fetchScholarSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        num: 1
      })
    );
    expect(result.papers).toHaveLength(1);
  });

  it('forwards advanced search filters', async () => {
    const client = {
      fetchScholarSearch: vi.fn(async () => ({
        html: fixture('scholar-search.html'),
        url: 'https://scholar.google.com/scholar?q=test'
      }))
    };

    const service = new ScholarService(client as never, parseConfig({ NODE_ENV: 'test' }), new Logger('error'));

    await service.searchAdvanced({
      query: 'test',
      author: 'Jane Doe',
      yearRange: [2020, 2024],
      exactPhrase: 'graph retrieval',
      excludeWords: 'survey',
      titleOnly: true,
      numResults: 5,
      start: 10,
      language: 'en'
    });

    expect(client.fetchScholarSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        as_sauthors: 'Jane Doe',
        as_ylo: 2020,
        as_yhi: 2024,
        as_epq: 'graph retrieval',
        as_eq: 'survey',
        as_occt: 'title',
        start: 10
      })
    );
  });

  it('selects the best author profile and falls back when resolution fails', async () => {
    const fetchScholarSearch = vi.fn(async () => ({
      html: fixture('scholar-search.html'),
      url: 'https://scholar.google.com/scholar?q=test'
    }));
    const fetchAuthorProfile = vi
      .fn()
      .mockResolvedValueOnce({
        html: '<html><div id="gsc_prf_in">Someone Else</div></html>',
        url: 'https://scholar.google.com/citations?user=AAA111AAAAJ'
      })
      .mockResolvedValueOnce({
        html: fixture('author-profile.html'),
        url: 'https://scholar.google.com/citations?user=BBB222AAAAJ'
      });

    const service = new ScholarService(
      {
        fetchScholarSearch,
        fetchAuthorProfile
      } as never,
      parseConfig({ NODE_ENV: 'test' }),
      new Logger('error')
    );

    const author = await service.getAuthorInfo('Jane Doe', 2, 'en');
    expect(author.authorName).toBe('Jane Doe');
    expect(author.publications).toHaveLength(2);

    const fallbackService = new ScholarService(
      {
        fetchScholarSearch,
        fetchAuthorProfile: vi.fn(async () => {
          throw new Error('blocked');
        })
      } as never,
      parseConfig({ NODE_ENV: 'test' }),
      new Logger('error')
    );

    const fallback = await fallbackService.getAuthorInfo('Jane Doe', 2, 'en');
    expect(fallback.authorId).toBe('unresolved');
    expect(fallback.publications.length).toBeGreaterThan(0);
  });
});
