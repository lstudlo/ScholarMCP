import { getCollection, render, type CollectionEntry } from 'astro:content';

export type DocsEntry = CollectionEntry<'docs'>;

export interface SidebarLinkItem {
  type: 'link';
  label: string;
  href: string;
  id: string;
  isCurrent: boolean;
}

export interface SidebarGroupItem {
  type: 'group';
  label: string;
  items: SidebarLinkItem[];
}

export type SidebarItem = SidebarLinkItem | SidebarGroupItem;

export interface DocsPageRecord {
  entry: DocsEntry;
  id: string;
  href: string;
  label: string;
  section: string | null;
  sectionLabel: string | null;
  order: number;
}

export interface DocsPageContext {
  page: DocsPageRecord;
  pages: DocsPageRecord[];
  sidebar: SidebarItem[];
  prev?: DocsPageRecord;
  next?: DocsPageRecord;
}

const SECTION_LABELS = new Map<string, string>([
  ['getting-started', 'Getting Started'],
  ['guides', 'Usage Guides'],
  ['reference', 'Reference'],
  ['releases', 'Releases']
]);

const titleCase = (value: string) =>
  value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const normalizeDocId = (id: string) => id.replace(/\/index$/, '');

export const docHrefFromId = (id: string) => (id === 'index' ? '/' : `/${normalizeDocId(id)}/`);

export const docSectionFromId = (id: string) => {
  const normalized = normalizeDocId(id);
  if (normalized === 'index') return null;
  return normalized.split('/')[0] ?? null;
};

export async function getDocsPages(): Promise<DocsPageRecord[]> {
  const entries = await getCollection('docs', ({ data }) => !data.draft);

  return entries
    .map((entry) => {
      const id = entry.id;
      const section = docSectionFromId(id);
      return {
        entry,
        id,
        href: docHrefFromId(id),
        label: entry.data.title,
        section,
        sectionLabel: section ? (SECTION_LABELS.get(section) ?? titleCase(section)) : null,
        order: entry.data.sidebar?.order ?? 9999
      } satisfies DocsPageRecord;
    })
    .sort((a, b) => {
      if (a.id === 'index') return -1;
      if (b.id === 'index') return 1;
      if ((a.section ?? '') !== (b.section ?? '')) {
        return (a.sectionLabel ?? '').localeCompare(b.sectionLabel ?? '');
      }
      if (a.order !== b.order) return a.order - b.order;
      return a.id.localeCompare(b.id);
    });
}

export async function getDocPageContext(id: string): Promise<DocsPageContext | undefined> {
  const pages = await getDocsPages();
  const currentIndex = pages.findIndex((page) => page.id === id);
  if (currentIndex === -1) return undefined;

  const page = pages[currentIndex]!;
  const prev = currentIndex > 0 ? pages[currentIndex - 1] : undefined;
  const next = currentIndex < pages.length - 1 ? pages[currentIndex + 1] : undefined;

  const grouped = new Map<string, SidebarLinkItem[]>();
  const sidebar: SidebarItem[] = [];

  for (const item of pages) {
    if (item.id === 'index') continue;

    const link: SidebarLinkItem = {
      type: 'link',
      label: item.label,
      href: item.href,
      id: item.id,
      isCurrent: item.id === id
    };

    if (!item.section) {
      sidebar.push(link);
      continue;
    }

    const list = grouped.get(item.section) ?? [];
    list.push(link);
    grouped.set(item.section, list);
  }

  for (const [section, items] of grouped) {
    sidebar.push({
      type: 'group',
      label: SECTION_LABELS.get(section) ?? titleCase(section),
      items
    });
  }

  return { page, pages, sidebar, prev, next };
}

export async function renderDocEntry(entry: DocsEntry) {
  return render(entry);
}

export function breadcrumbParts(page: DocsPageRecord) {
  const normalized = normalizeDocId(page.id);
  if (normalized === 'index') return [];
  const parts = normalized.split('/');
  const crumbs = [];

  for (let index = 0; index < parts.length; index += 1) {
    const segment = parts[index]!;
    const id = parts.slice(0, index + 1).join('/');
    crumbs.push({
      label: index === parts.length - 1 ? page.label : SECTION_LABELS.get(segment) ?? titleCase(segment),
      href: `/${id}/`,
      isCurrent: index === parts.length - 1
    });
  }

  return crumbs;
}
