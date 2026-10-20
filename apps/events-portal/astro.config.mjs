import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  // Variables desde el .env global del monorepo; solo PUBLIC_* llega al navegador.
  vite: { plugins: [tailwindcss()], envDir: fileURLToPath(new URL('../..', import.meta.url)) },
  server: { host: true, port: 4321 },
});
