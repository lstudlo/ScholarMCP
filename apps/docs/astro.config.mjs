import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

const siteUrl = process.env.DOCS_SITE_URL ?? 'https://scholar-mcp.lstudlo.com';

export default defineConfig({
  output: 'static',
  compressHTML: true,
  devToolbar: {
    enabled: false
  },
  site: siteUrl,
  trailingSlash: 'always',
  integrations: [sitemap({ filter: (page) => !new URL(page).pathname.startsWith('/404') })],
  vite: {
    plugins: [tailwindcss()]
  }
});
