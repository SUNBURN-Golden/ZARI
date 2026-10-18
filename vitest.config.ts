import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['apps/web/tests/unit/**/*.test.ts', 'tools/**/tests/**/*.test.{ts,mjs}'], environment: 'node' },
});
