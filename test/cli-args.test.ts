import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../src/cli/args.js';

describe('parseCliArgs', () => {
  it('parses help and version flags', () => {
    expect(parseCliArgs(['--help']).showHelp).toBe(true);
    expect(parseCliArgs(['-h']).showHelp).toBe(true);
    expect(parseCliArgs(['--version']).showVersion).toBe(true);
    expect(parseCliArgs(['-v']).showVersion).toBe(true);
  });

  it('parses transport in --transport=value form', () => {
    expect(parseCliArgs(['--transport=stdio']).transport).toBe('stdio');
    expect(parseCliArgs(['--transport=http']).transport).toBe('http');
    expect(parseCliArgs(['--transport=both']).transport).toBe('both');
  });

  it('parses transport in --transport value form', () => {
    expect(parseCliArgs(['--transport', 'stdio']).transport).toBe('stdio');
  });

  it('rejects invalid transport', () => {
    expect(() => parseCliArgs(['--transport=invalid'])).toThrow(/Invalid transport/);
  });

  it('rejects unknown args', () => {
    expect(() => parseCliArgs(['--unknown'])).toThrow(/Unknown argument/);
  });
});
