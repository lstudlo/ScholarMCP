import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

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
      customCss: ['./src/styles/global.css'],
      components: {
        ContentPanel: './src/components/ContentPanel.astro',
        Header: './src/components/Header.astro',
        PageFrame: './src/components/PageFrame.astro',
        PageSidebar: './src/components/PageSidebar.astro',
        SiteTitle: './src/components/SiteTitle.astro',
        Sidebar: './src/components/Sidebar.astro',
        TwoColumnContent: './src/components/TwoColumnContent.astro',
        Pagination: './src/components/Pagination.astro',
        ThemeSelect: './src/components/ThemeSelect.astro'
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
    plugins: [tailwindcss()],
    server: {
      fs: {
        allow: [resolve(__dirname, '../..')]
      }
    }
  }
});
