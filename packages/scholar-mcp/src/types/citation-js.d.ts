declare module '@citation-js/core' {
  export class Cite {
    constructor(data?: unknown);
    static async(data?: unknown): Promise<Cite>;
    format(type: string, options?: Record<string, unknown>): string;
  }
}

declare module '@citation-js/plugin-csl';
declare module '@citation-js/plugin-bibtex';
declare module '@citation-js/plugin-doi';
