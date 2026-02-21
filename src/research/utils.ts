import { createHash, randomUUID } from 'node:crypto';

export const nowIso = (): string => new Date().toISOString();

export const makeStableId = (parts: Array<string | null | undefined>, prefix: string): string => {
  const value = parts.filter(Boolean).join('|');
  if (!value) {
    return `${prefix}_${randomUUID()}`;
  }

  const digest = createHash('sha1').update(value).digest('hex').slice(0, 16);
  return `${prefix}_${digest}`;
};

export const normalizeWhitespace = (input: string): string => input.replace(/\s+/g, ' ').trim();

export const normalizeDoi = (doi: string | null | undefined): string | null => {
  if (!doi) {
    return null;
  }

  return doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .toLowerCase();
};

export const parseYear = (input: unknown): number | null => {
  if (typeof input === 'number' && Number.isInteger(input) && input >= 1000 && input <= 2100) {
    return input;
  }

  if (typeof input === 'string') {
    const match = input.match(/(?:19|20)\d{2}/);
    if (match?.[0]) {
      const year = Number.parseInt(match[0], 10);
      if (year >= 1000 && year <= 2100) {
        return year;
      }
    }
  }

  return null;
};

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const tokenizeForRanking = (input: string): string[] =>
  normalizeWhitespace(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(' ')
    .filter((token) => token.length >= 3);

export const overlapScore = (a: string[], b: string[]): number => {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const bSet = new Set(b);
  let overlap = 0;
  for (const token of a) {
    if (bSet.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(a.length, b.length);
};
