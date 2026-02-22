import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteUrl = process.env.DOCS_SITE_URL ?? 'https://scholar-mcp.lstudlo.com';

export default defineConfig({
  site: siteUrl,
  integrations: [
    starlight({
      title: 'ScholarMCP',
      description: 'Official documentation for installing, configuring, and using ScholarMCP.',
      favicon: '/favicon.png',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/lstudlo/ScholarMCP' }],
      editLink: {
        baseUrl: 'https://github.com/lstudlo/ScholarMCP/edit/main/apps/docs/'
      },
      sidebar: [
        {
          label: 'Getting Started',
          autogenerate: { directory: 'getting-started' }
        },
        {
          label: 'Usage Guides',
          autogenerate: { directory: 'guides' }
        },
        {
          label: 'Reference',
          autogenerate: { directory: 'reference' }
        },
        {
          label: 'Releases',
          autogenerate: { directory: 'releases' }
        }
      ]
    })
  ],
  vite: {
    server: {
      fs: {
        allow: [resolve(__dirname, '../..')]
      }
    }
  }
});
