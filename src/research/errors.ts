export class ResearchError extends Error {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'ResearchError';
  }
}

export class ResearchProviderError extends ResearchError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly status?: number,
    details?: Record<string, unknown>
  ) {
    super(message, details);
    this.name = 'ResearchProviderError';
  }
}

export class IngestionError extends ResearchError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.name = 'IngestionError';
  }
}

export class DocumentNotFoundError extends ResearchError {
  constructor(documentId: string) {
    super(`Document not found: ${documentId}`, { documentId });
    this.name = 'DocumentNotFoundError';
  }
}

export class JobNotFoundError extends ResearchError {
  constructor(jobId: string) {
    super(`Ingestion job not found: ${jobId}`, { jobId });
    this.name = 'JobNotFoundError';
  }
}
