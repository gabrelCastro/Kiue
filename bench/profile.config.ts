import { defineConfig } from '@playwright/test';

// Perfil de CPU: `npm run bench:profile` (usa o build de produção).
export default defineConfig({
  testDir: '.',
  testMatch: 'profile.spec.ts',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:4317', viewport: { width: 1440, height: 900 } },
  webServer: { command: 'npx vite preview --port 4317 --strictPort', cwd: '..', port: 4317, reuseExistingServer: true },
});
