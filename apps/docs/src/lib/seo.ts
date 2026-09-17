import { version } from '../../../../packages/scholar-mcp/package.json';

export const siteName = 'ScholarMCP';
export const repositoryUrl = 'https://github.com/lstudlo/ScholarMCP';
export const packageUrl = 'https://www.npmjs.com/package/scholar-mcp';
export const productDescription = 'ScholarMCP is an open-source MCP server for academic research. Search papers, parse PDFs, and build citations in Claude Code, Codex, and other MCP clients.';

export interface Breadcrumb {
  label: string;
  href: string;
}

export function pageGraph(site: URL, canonical: URL, title: string, description: string, breadcrumbs: Breadcrumb[]) {
  const root = new URL('/', site).href;
  const home = canonical.pathname === '/';
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization', '@id': `${root}#publisher`, name: 'lstudlo',
        url: 'https://github.com/lstudlo',
        logo: new URL('/lstudlo_logo.svg', site).href
      },
      {
        '@type': 'WebSite', '@id': `${root}#website`, url: root,
        name: siteName, alternateName: 'Scholar MCP', description: productDescription,
        inLanguage: 'en', publisher: { '@id': `${root}#publisher` }
      },
      {
        '@type': 'SoftwareSourceCode', '@id': `${root}#software`, name: siteName,
        alternateName: 'scholar-mcp', description: productDescription, url: root,
        codeRepository: repositoryUrl, programmingLanguage: 'TypeScript',
        runtimePlatform: 'Node.js', version,
        license: `${repositoryUrl}/blob/main/LICENSE`,
        sameAs: [repositoryUrl, packageUrl]
      },
      {
        '@type': 'WebPage', '@id': `${canonical.href}#page`,
        url: canonical.href, name: title, headline: title, description, inLanguage: 'en',
        isPartOf: { '@id': `${root}#website` }, about: { '@id': `${root}#software` },
        publisher: { '@id': `${root}#publisher` },
        ...(!home ? { mainEntity: {
          '@type': 'TechArticle', headline: title, description, url: canonical.href,
          about: { '@id': `${root}#software` },
          publisher: { '@id': `${root}#publisher` }
        } } : {}),
        ...(breadcrumbs.length ? { breadcrumb: { '@id': `${canonical.href}#breadcrumbs` } } : {})
      },
      ...(breadcrumbs.length ? [{
        '@type': 'BreadcrumbList', '@id': `${canonical.href}#breadcrumbs`,
        itemListElement: breadcrumbs.map((crumb, index) => ({
          '@type': 'ListItem', position: index + 1,
          name: crumb.label, item: new URL(crumb.href, site).href
        }))
      }] : [])
    ]
  };
}
