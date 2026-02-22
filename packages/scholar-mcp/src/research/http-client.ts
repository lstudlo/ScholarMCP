import { setTimeout as sleep } from 'node:timers/promises';
import type { AppConfig } from '../config.js';
import { ResearchProviderError } from './errors.js';

interface FetchJsonOptions {
  provider: string;
  url: URL;
  headers?: Record<string, string>;
}

export class ResearchHttpClient {
  private lastRequestAt = 0;

  constructor(private readonly config: AppConfig) {}

  async fetchJson<T>({ provider, url, headers }: FetchJsonOptions): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.config.researchRetryAttempts) {
      await this.waitBeforeRequest();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.researchTimeoutMs);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal
        });

        if (!response.ok) {
          const body = await response.text();
          throw new ResearchProviderError(
            `Provider ${provider} returned HTTP ${response.status}`,
            provider,
            response.status,
            { url: url.toString(), body: body.slice(0, 1000) }
          );
        }

        const json = (await response.json()) as T;
        return json;
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt >= this.config.researchRetryAttempts;
        if (isLastAttempt) {
          break;
        }

        await sleep(this.config.researchRetryDelayMs);
      } finally {
        clearTimeout(timeoutId);
      }

      attempt += 1;
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new ResearchProviderError(`Unknown provider error for ${provider}`, provider, undefined, {
      url: url.toString()
    });
  }

  private async waitBeforeRequest(): Promise<void> {
    if (this.config.researchRequestDelayMs <= 0) {
      this.lastRequestAt = Date.now();
      return;
    }

    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    const waitMs = this.config.researchRequestDelayMs - elapsed;
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    this.lastRequestAt = Date.now();
  }
}
