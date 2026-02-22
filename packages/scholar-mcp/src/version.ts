import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const getPackageVersion = (): string => {
  try {
    const pkg = require('../package.json') as { version?: string };
    if (typeof pkg.version === 'string' && pkg.version.trim().length > 0) {
      return pkg.version;
    }
  } catch {
    // Fall through to static fallback.
  }

  return '0.0.0';
};
