import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

const API_URL = process.env.API_URL ?? 'http://localhost:8787';

export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { chunkSizeWarningLimit: 900 },
  // a API (server/) roda à parte em desenvolvimento; o navegador vê tudo no mesmo domínio
  // porta fixa: a API só aceita escrita vinda da origem configurada (APP_URL, padrão :5173)
  server: { port: 5173, strictPort: true, proxy: { '/api': API_URL } },
  preview: { proxy: { '/api': API_URL } },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'server/tests/**/*.test.ts'],
  },
});
