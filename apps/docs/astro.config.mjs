import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  integrations: [
    starlight({
      title: 'ScholarMCP Documentation',
      description: 'Documentation for ScholarMCP tools, architecture, and operations.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/lstudlo/ScolarMCP' }],
      editLink: {
        baseUrl: 'https://github.com/lstudlo/ScolarMCP/edit/main/apps/docs/'
      },
      sidebar: [
        {
          label: 'Getting Started',
          autogenerate: { directory: 'getting-started' }
        },
        {
          label: 'Guides',
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
