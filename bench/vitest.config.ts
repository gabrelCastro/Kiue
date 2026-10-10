import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, environment: 'node', include: ['bench/**/*.perf.ts'], testTimeout: 600_000 },
});
