import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  // no CI: falha se sobrar um test.only, tenta de novo uma vez (e marca o teste como instável)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4317', viewport: { width: 1440, height: 900 } },
  webServer: [
    {
      // API de teste: banco em memória, some ao fim da execução
      command: 'npx tsx server/src/index.ts',
      port: 4318,
      env: { PORT: '4318', DATABASE_PATH: ':memory:', APP_URL: 'http://localhost:4317', SCRYPT_COST: '12', NODE_NO_WARNINGS: '1' },
      reuseExistingServer: false,
    },
    { command: 'npx vite preview --port 4317 --strictPort', port: 4317, env: { API_URL: 'http://localhost:4318' }, reuseExistingServer: false },
  ],
});
