import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@pm-operator/api': path.resolve(__dirname, '../../packages/api/src/index.ts'),
      '@pm-operator/db': path.resolve(__dirname, '../../packages/db/src/index.ts'),
      '@pm-operator/mcp': path.resolve(__dirname, '../../packages/mcp/src/index.ts'),
      'server-only': path.resolve(__dirname, './e2e/__mocks__/server-only.ts'),
      'server-only$': path.resolve(__dirname, './e2e/__mocks__/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['e2e/concurrency.vitest.ts'],
    globals: false,
  },
});
