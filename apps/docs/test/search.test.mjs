import assert from 'node:assert/strict';
import test from 'node:test';
import { searchRecords } from '../src/lib/search.ts';

const page = (id, title, body = '') => ({ id, title, body, href: `/${id}/`, description: '', section: '', headings: [] });

test('API parameters in page bodies are searchable without outranking title matches', () => {
  const records = [page('api', 'MCP Tools', 'Optional year_range object'), page('guide', 'year_range')];
  assert.deepEqual(searchRecords(records, 'year_range').map(result => result.id), ['guide', 'api']);
});

test('search handles hyphenated headings, Unicode, empty queries, and result limits', () => {
  assert.equal(searchRecords([page('ingestion', 'Full-text Ingestion')], 'fulltext').length, 1);
  assert.equal(searchRecords([page('research', '文獻搜尋')], '文獻')[0].id, 'research');
  assert.deepEqual(searchRecords([page('api', 'MCP Tools')], '  '), []);
  assert.equal(searchRecords(Array.from({ length: 20 }, (_, i) => page(String(i), 'MCP')), 'mcp').length, 12);
});
