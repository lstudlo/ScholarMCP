import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalArgv = process.argv.slice();
const originalExitCode = process.exitCode;

const loadIndex = async (argv: string[], setupMocks?: () => void) => {
  vi.resetModules();
  vi.clearAllMocks();
  process.argv = ['node', 'index.ts', ...argv];
  process.exitCode = undefined;
  setupMocks?.();
  await import('../src/index.ts');
};

describe('index bootstrap', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    process.argv = originalArgv.slice();
    process.exitCode = originalExitCode;
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.doUnmock('../src/cli/args.js');
    vi.doUnmock('../src/config.js');
    vi.doUnmock('../src/http/start-http-server.js');
    vi.doUnmock('../src/mcp/start-stdio-server.js');
    vi.doUnmock('../src/research/research-service.js');
    vi.doUnmock('../src/scholar/scholar-service.js');
    vi.doUnmock('../src/version.js');
    vi.doUnmock('dotenv');
  });

  it('prints help and version output', async () => {
    await loadIndex(['--help'], () => {
      vi.doMock('dotenv', () => ({ config: vi.fn() }));
    });
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));

    await loadIndex(['--version'], () => {
      vi.doMock('dotenv', () => ({ config: vi.fn() }));
      vi.doMock('../src/version.js', () => ({
        getPackageVersion: () => '9.9.9'
      }));
    });
    expect(stdoutSpy).toHaveBeenCalledWith('9.9.9\n');
  });

  it('starts the configured transports', async () => {
    const startHttpServer = vi.fn();
    const startStdioServer = vi.fn(async () => undefined);

    await loadIndex(['--transport=both'], () => {
      vi.doMock('dotenv', () => ({ config: vi.fn() }));
      vi.doMock('../src/http/start-http-server.js', () => ({ startHttpServer }));
      vi.doMock('../src/mcp/start-stdio-server.js', () => ({ startStdioServer }));
      vi.doMock('../src/scholar/scholar-service.js', () => ({
        ScholarService: {
          fromConfig: vi.fn(() => ({ kind: 'scholar-service' }))
        }
      }));
      vi.doMock('../src/research/research-service.js', () => ({
        ResearchService: {
          fromConfig: vi.fn(() => ({ kind: 'research-service' }))
        }
      }));
    });

    expect(startHttpServer).toHaveBeenCalledOnce();
    expect(startStdioServer).toHaveBeenCalledOnce();
  });

  it('reports startup errors and prints CLI usage for argument failures', async () => {
    await loadIndex(['--unknown'], () => {
      vi.doMock('dotenv', () => ({ config: vi.fn() }));
    });

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('ScholarMCP failed to start:'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(process.exitCode).toBe(1);
  });

  it('reports unsupported transports from config', async () => {
    await loadIndex([], () => {
      vi.doMock('dotenv', () => ({ config: vi.fn() }));
      vi.doMock('../src/config.js', async () => {
        const actual = await vi.importActual<typeof import('../src/config.js')>('../src/config.js');
        return {
          ...actual,
          parseConfig: () => ({
            transport: 'invalid',
            logLevel: 'error',
            serverName: 'scholar-mcp',
            serverVersion: 'test-version'
          })
        };
      });
      vi.doMock('../src/scholar/scholar-service.js', () => ({
        ScholarService: {
          fromConfig: vi.fn(() => ({ kind: 'scholar-service' }))
        }
      }));
      vi.doMock('../src/research/research-service.js', () => ({
        ResearchService: {
          fromConfig: vi.fn(() => ({ kind: 'research-service' }))
        }
      }));
    });

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unsupported transport mode: invalid'));
    expect(process.exitCode).toBe(1);
  });
});
