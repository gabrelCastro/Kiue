// Igual a profile.config.ts, mas no servidor de desenvolvimento: o perfil sai com os nomes reais das funções.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'profile.spec.ts',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1440, height: 900 } },
  webServer: { command: 'npx vite --port 5173 --strictPort', cwd: '..', port: 5173, reuseExistingServer: true },
});
