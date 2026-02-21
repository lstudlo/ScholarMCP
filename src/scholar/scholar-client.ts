import { setTimeout as sleep } from 'node:timers/promises';
import type { AppConfig } from '../config.js';
import { ScholarBlockedError, ScholarFetchError } from './errors.js';

const SCHOLAR_SEARCH_PATH = '/scholar';
const SCHOLAR_CITATIONS_PATH = '/citations';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const BLOCK_PATTERNS = [
  /detected unusual traffic/i,
  /not a robot/i,
  /please show you're not a robot/i,
  /accounts\.google\.com\/v3\/signin/i,
  /sorry\/index/i
];

const toSearchParams = (values: Record<string, string | number | undefined>): URLSearchParams => {
  const params = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    params.set(key, String(value));
  });

  return params;
};

export class ScholarClient {
  private lastRequestAt = 0;

  constructor(private readonly config: AppConfig) {}

  async fetchScholarSearch(params: Record<string, string | number | undefined>): Promise<{ html: string; url: string }> {
    return this.fetchHtml(SCHOLAR_SEARCH_PATH, params);
  }

  async fetchAuthorProfile(authorId: string, language: string): Promise<{ html: string; url: string }> {
    return this.fetchHtml(SCHOLAR_CITATIONS_PATH, {
      user: authorId,
      hl: language
    });
  }

  private async fetchHtml(
    path: string,
    params: Record<string, string | number | undefined>
  ): Promise<{ html: string; url: string }> {
    const requestUrl = new URL(path, this.config.scholarBaseUrl);
    requestUrl.search = toSearchParams(params).toString();

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.config.scholarRetryAttempts) {
      await this.waitBeforeRequest();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.scholarTimeoutMs);

      try {
        const response = await fetch(requestUrl, {
          method: 'GET',
          headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,application/xhtml+xml'
          },
          signal: controller.signal
        });

        const html = await response.text();

        if (!response.ok) {
          throw new ScholarFetchError(
            `Google Scholar returned HTTP ${response.status}`,
            requestUrl.toString(),
            response.status,
            { statusText: response.statusText }
          );
        }

        this.assertNotBlocked(html, requestUrl.toString());
        return { html, url: requestUrl.toString() };
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt >= this.config.scholarRetryAttempts;
        if (isLastAttempt) {
          break;
        }

        await sleep(this.config.scholarRetryDelayMs);
      } finally {
        clearTimeout(timeoutId);
      }

      attempt += 1;
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new ScholarFetchError('Unknown Google Scholar fetch error', requestUrl.toString());
  }

  private assertNotBlocked(html: string, url: string): void {
    if (BLOCK_PATTERNS.some((pattern) => pattern.test(html))) {
      throw new ScholarBlockedError(
        'Google Scholar blocked or challenged this request. Try slower request settings or run from a different network.',
        url
      );
    }
  }

  private async waitBeforeRequest(): Promise<void> {
    if (this.config.scholarRequestDelayMs <= 0) {
      this.lastRequestAt = Date.now();
      return;
    }

    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    const delay = this.config.scholarRequestDelayMs - elapsed;

    if (delay > 0) {
      await sleep(delay);
    }

    this.lastRequestAt = Date.now();
  }
}
