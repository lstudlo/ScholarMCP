import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const binPath = resolve(root, 'dist/index.js');

if (!existsSync(binPath)) {
  console.error('Missing dist/index.js. Run the build before packaging.');
  process.exit(1);
}

const fileContents = readFileSync(binPath, 'utf8');
if (!fileContents.startsWith('#!/usr/bin/env node')) {
  console.error('dist/index.js is missing the expected hashbang.');
  process.exit(1);
}

try {
  chmodSync(binPath, 0o755);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to apply executable permissions to dist/index.js: ${message}`);
  process.exit(1);
}
