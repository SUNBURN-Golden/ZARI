import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['apps/web/src/contracts/generated/**', '**/dist/**', '**/pkg/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    languageOptions: {
      globals: Object.fromEntries([
        'window', 'document', 'self', 'console', 'Worker', 'URL', 'crypto',
        'setTimeout', 'clearTimeout', 'TextEncoder', 'MessageEvent', 'ErrorEvent',
        'Event', 'AbortController', 'process', 'performance', 'navigator',
      ].map((name) => [name, 'readonly'])),
    },
  },
);
