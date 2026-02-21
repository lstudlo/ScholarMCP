export class ScholarError extends Error {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'ScholarError';
  }
}

export class ScholarFetchError extends ScholarError {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status?: number,
    details?: Record<string, unknown>
  ) {
    super(message, details);
    this.name = 'ScholarFetchError';
  }
}

export class ScholarBlockedError extends ScholarFetchError {
  constructor(message: string, url: string, details?: Record<string, unknown>) {
    super(message, url, undefined, details);
    this.name = 'ScholarBlockedError';
  }
}

export class ScholarParseError extends ScholarError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.name = 'ScholarParseError';
  }
}
