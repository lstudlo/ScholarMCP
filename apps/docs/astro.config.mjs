import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteUrl = process.env.DOCS_SITE_URL ?? 'https://scholar-mcp.lstudlo.com';

export default defineConfig({
  site: siteUrl,
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      fs: {
        allow: [resolve(__dirname, '../..')]
      }
    }
  }
});
