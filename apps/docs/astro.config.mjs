import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

const siteUrl = process.env.DOCS_SITE_URL ?? 'https://scholar-mcp.lstudlo.com';

export default defineConfig({
  output: 'static',
  compressHTML: true,
  devToolbar: {
    enabled: false
  },
  site: siteUrl,
  vite: {
    plugins: [tailwindcss()]
  }
});
