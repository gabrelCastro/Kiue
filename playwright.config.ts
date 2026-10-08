import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4317', viewport: { width: 1440, height: 900 } },
  webServer: { command: 'npx vite preview --port 4317 --strictPort', port: 4317, reuseExistingServer: true },
});
