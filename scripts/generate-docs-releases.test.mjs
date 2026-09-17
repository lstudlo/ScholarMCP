import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('release docs stay unchanged after tagging and ignore tags beyond the checkout', () => {
  const root = mkdtempSync(join(tmpdir(), 'scholar-release-docs-'));
  const git = (...args) => execFileSync('git', args, {
    cwd: root,
    env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' },
    stdio: 'pipe'
  });
  const generate = () => {
    execFileSync(process.execPath, ['scripts/generate-docs-releases.mjs'], { cwd: root });
    return readFileSync(join(root, 'apps/docs/src/content/docs/releases/index.md'), 'utf8');
  };
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'packages/scholar-mcp'), { recursive: true });
    copyFileSync(new URL('./generate-docs-releases.mjs', import.meta.url), join(root, 'scripts/generate-docs-releases.mjs'));
    writeFileSync(join(root, 'packages/scholar-mcp/package.json'), JSON.stringify({ version: '1.2.0' }));
    git('init');
    git('remote', 'add', 'origin', 'https://github.com/lstudlo/ScholarMCP.git');
    git('add', '.');
    git('commit', '-m', 'Previous release');
    git('tag', '-a', 'v1.1.0', '-m', 'Previous release');
    git('commit', '--allow-empty', '-m', 'Prepare release');
    const before = generate();
    assert.match(before, /v1\.1\.0/);
    assert.match(before, /\[\*\*1\.2\.0\*\*\]/);
    git('tag', '-a', 'v1.2.0', '-m', 'Current release');
    assert.equal(generate(), before);
    git('commit', '--allow-empty', '-m', 'Future release');
    git('tag', '-a', 'v1.3.0', '-m', 'Future release');
    git('checkout', '--detach', 'HEAD^');
    assert.equal(generate(), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
