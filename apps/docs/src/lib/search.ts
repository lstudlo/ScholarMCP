export interface SearchRecord {
  id: string;
  href: string;
  title: string;
  description: string;
  section: string;
  headings: string[];
  body: string;
}

export interface SearchResult extends SearchRecord {
  score: number;
  matchedHeading: string;
}

const normalize = (value: string): string => value.normalize('NFKC').toLowerCase().replace(/[-_]/g, '');

export function searchRecords(records: SearchRecord[], query: string): SearchResult[] {
  const q = normalize(query.trim());
  if (!q) return [];

  return records.flatMap((record): SearchResult[] => {
    const title = normalize(record.title);
    const description = normalize(record.description);
    let score = title === q ? 120 : title.startsWith(q) ? 90 : title.includes(q) ? 70 : 0;
    if (normalize(record.section).includes(q)) score += 30;
    if (description.includes(q)) score += 25;
    const matchedHeading = record.headings.find((heading) => normalize(heading).includes(q)) ?? '';
    if (matchedHeading) score += normalize(matchedHeading) === q ? 45 : 32;
    if (normalize(record.body).includes(q)) score += 10;
    for (const token of q.split(/\s+/).filter((value) => value.length >= 2)) {
      if (title.includes(token)) score += 12;
      if (description.includes(token)) score += 6;
    }
    return score ? [{ ...record, score, matchedHeading }] : [];
  }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 12);
}
