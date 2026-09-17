import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('API docs preserve outer schema types and mark defaulted inputs optional', () => {
  execFileSync(process.execPath, [new URL('./generate-docs-api.mjs', import.meta.url).pathname]);
  const docs = readFileSync(new URL('../apps/docs/src/content/docs/reference/mcp-tools.md', import.meta.url), 'utf8');
  assert.equal((docs.match(/\| `year_range` \| object \| No \|/g) ?? []).length, 2);
  assert.match(docs, /\| `sources` \| array \| No \|/);
  assert.match(docs, /\| `limit` \| number \| No \| 10 \|/);
  assert.match(docs, /\| `query` \| string \| Yes \|/);
});
