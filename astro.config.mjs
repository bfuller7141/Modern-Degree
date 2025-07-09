import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.moderndegreeservices.com',
  integrations: [sitemap()],
  trailingSlash: 'never',
});