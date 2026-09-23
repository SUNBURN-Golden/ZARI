import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => ({
  root: 'apps/web',
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    rolldownOptions: {
      input: mode === 'test'
        ? { app: resolve('apps/web/index.html'), harness: resolve('apps/web/tests/harness.html') }
        : resolve('apps/web/index.html'),
    },
  },
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true },
}));
