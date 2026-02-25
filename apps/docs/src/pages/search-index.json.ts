import { getDocsPages, renderDocEntry } from '../lib/docs';

export const prerender = true;

export async function GET() {
  const pages = await getDocsPages();

  const records = await Promise.all(
    pages.map(async (page) => {
      const { headings } = await renderDocEntry(page.entry);
      return {
        id: page.id,
        href: page.href,
        title: page.label,
        description: page.entry.data.description ?? '',
        section: page.sectionLabel ?? 'Documentation',
        headings: headings.map((h) => h.text)
      };
    })
  );

  return new Response(JSON.stringify(records), {
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}
