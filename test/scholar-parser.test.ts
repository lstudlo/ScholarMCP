import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractAuthorIdsFromSearch,
  parseAuthorName,
  parseScholarAuthorProfile,
  parseScholarSearchResult
} from '../src/scholar/scholar-parser.js';

const fixture = (name: string) => readFileSync(resolve(process.cwd(), 'test', 'fixtures', name), 'utf8');

describe('scholar-parser', () => {
  it('parses paper search results', () => {
    const html = fixture('scholar-search.html');
    const parsed = parseScholarSearchResult(
      html,
      'https://scholar.google.com',
      'https://scholar.google.com/scholar?q=test',
      'test'
    );

    expect(parsed.query).toBe('test');
    expect(parsed.totalResultsText).toBe('About 2 results');
    expect(parsed.nextPageStart).toBe(10);
    expect(parsed.papers).toHaveLength(2);

    expect(parsed.papers[0]).toMatchObject({
      title: 'Paper One',
      year: 2022,
      citedByCount: 42,
      versionsCount: 3
    });

    expect(parsed.papers[0].authorIds).toEqual(['AAA111AAAAJ', 'BBB222AAAAJ']);
    expect(parsed.papers[1]).toMatchObject({
      title: 'Paper Two',
      year: 2019,
      citedByCount: 7
    });
  });

  it('extracts author ids from search snippets', () => {
    const html = fixture('scholar-search.html');
    const ids = extractAuthorIdsFromSearch(html);
    expect(ids).toEqual(['AAA111AAAAJ', 'BBB222AAAAJ']);
  });

  it('parses author profile and metrics', () => {
    const html = fixture('author-profile.html');
    const profile = parseScholarAuthorProfile(html, 'https://scholar.google.com', 'TEST123AAAAJ', 5);

    expect(profile.authorName).toBe('Jane Doe');
    expect(profile.affiliation).toBe('Professor of Computer Science, Example University');
    expect(profile.verifiedEmail).toBe('example.edu');
    expect(profile.interests).toEqual(['Machine Learning', 'NLP']);
    expect(profile.metrics).toMatchObject({
      citationsAll: 12345,
      citationsSince: 5678,
      hIndexAll: 55,
      hIndexSince: 31,
      i10IndexAll: 120,
      i10IndexSince: 60
    });
    expect(profile.publications).toHaveLength(2);
    expect(profile.publications[0]).toMatchObject({
      title: 'Paper A',
      year: 2022,
      citations: 150
    });
  });

  it('extracts author name from profile html', () => {
    const html = fixture('author-profile.html');
    expect(parseAuthorName(html)).toBe('Jane Doe');
  });
});
