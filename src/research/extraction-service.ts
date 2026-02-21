import type { ParsedDocument, GranularPaperDetails, SectionChunk } from './types.js';
import { normalizeWhitespace } from './utils.js';

export interface GranularExtractionInput {
  sections?: string[];
  includeReferences?: boolean;
}

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter((sentence) => sentence.length > 20);

const collectByPatterns = (
  sections: SectionChunk[],
  patterns: RegExp[],
  confidence: number
): Array<{ text: string; confidence: number; sectionId: string }> => {
  const output: Array<{ text: string; confidence: number; sectionId: string }> = [];

  for (const section of sections) {
    const sentences = splitSentences(section.text);
    for (const sentence of sentences) {
      if (patterns.some((pattern) => pattern.test(sentence))) {
        output.push({
          text: sentence,
          confidence,
          sectionId: section.id
        });
      }
    }
  }

  return output.slice(0, 25);
};

const uniqueList = (items: string[]): string[] => {
  const set = new Set<string>();
  for (const item of items) {
    const normalized = normalizeWhitespace(item);
    if (normalized.length > 0) {
      set.add(normalized);
    }
  }

  return [...set];
};

const extractDatasets = (sections: SectionChunk[]): string[] => {
  const matches: string[] = [];
  const datasetPattern = /([A-Z][A-Za-z0-9\-]+\s+(?:dataset|corpus|benchmark))/g;

  for (const section of sections) {
    for (const match of section.text.matchAll(datasetPattern)) {
      if (match[1]) {
        matches.push(match[1]);
      }
    }
  }

  return uniqueList(matches).slice(0, 30);
};

const extractMetrics = (sections: SectionChunk[]): string[] => {
  const metricPatterns = [
    /\bF1(?:-score)?\b/gi,
    /\baccuracy\b/gi,
    /\bprecision\b/gi,
    /\brecall\b/gi,
    /\bAUC\b/gi,
    /\bRMSE\b/gi,
    /\bMAE\b/gi,
    /\bBLEU\b/gi,
    /\bROUGE\b/gi,
    /\bmAP\b/gi
  ];

  const found: string[] = [];
  for (const section of sections) {
    for (const pattern of metricPatterns) {
      for (const match of section.text.matchAll(pattern)) {
        if (match[0]) {
          found.push(match[0].toUpperCase());
        }
      }
    }
  }

  return uniqueList(found);
};

export class ExtractionService {
  extract(document: ParsedDocument, input: GranularExtractionInput): GranularPaperDetails {
    const selectedSections = this.selectSections(document.sections, input.sections);

    const claims = collectByPatterns(
      selectedSections,
      [
        /\bwe (?:propose|present|show|demonstrate)\b/i,
        /\bthis paper\b/i,
        /\bour (?:results|findings)\b/i,
        /\bwe find that\b/i
      ],
      Math.max(0.45, document.parser.confidence - 0.2)
    );

    const methods = collectByPatterns(
      selectedSections,
      [
        /\bmethod(?:ology)?\b/i,
        /\bapproach\b/i,
        /\bmodel\b/i,
        /\balgorithm\b/i,
        /\bexperimental setup\b/i
      ],
      Math.max(0.5, document.parser.confidence - 0.15)
    );

    const limitations = collectByPatterns(
      selectedSections,
      [/\blimitation\b/i, /\bhowever\b/i, /\bfuture work\b/i, /\bchallenge\b/i, /\bconstraint\b/i],
      Math.max(0.4, document.parser.confidence - 0.25)
    );

    return {
      documentId: document.documentId,
      title: document.title,
      abstract: document.abstract,
      requestedSections: selectedSections,
      claims,
      methods,
      limitations,
      datasets: extractDatasets(selectedSections),
      metrics: extractMetrics(selectedSections),
      references: input.includeReferences === false ? [] : document.references,
      parserConfidence: document.parser.confidence,
      provenance: document.provenance
    };
  }

  private selectSections(sections: SectionChunk[], requested?: string[]): SectionChunk[] {
    if (!requested || requested.length === 0) {
      return sections;
    }

    const normalizedRequested = requested.map((name) => name.trim().toLowerCase());
    const selected = sections.filter((section) =>
      normalizedRequested.some((target) => section.heading.toLowerCase().includes(target))
    );

    return selected.length > 0 ? selected : sections;
  }
}
