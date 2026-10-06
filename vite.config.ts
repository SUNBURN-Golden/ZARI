import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';

/**
 * Emits `zari-build.json` — the complete asset manifest the service worker
 * stages atomically (PERFORMANCE_SECURITY_FAILURES §2). `buildId` is a
 * content digest over every emitted file's path+hash, so any asset change
 * produces a different build identity; `builtAt` orders builds for
 * downgrade protection. It is computed in `closeBundle` so HTML output
 * (written after `generateBundle`) is included — the manifest must cover
 * every file the shell needs offline.
 */
function buildManifestPlugin(): Plugin {
  const hash = (data: string | Uint8Array) =>
    createHash('sha256').update(data).digest('hex');
  let config: ResolvedConfig;
  return {
    name: 'zari-build-manifest',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      const files: { path: string; sha256: string }[] = [];
      const walk = (dir: string, prefix: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
          else
            files.push({
              path: `${prefix}${name}`,
              sha256: hash(readFileSync(full)),
            });
        }
      };
      walk(outDir, '');
      files.sort((a, b) => a.path.localeCompare(b.path));
      const buildId = hash(
        files.map((f) => `${f.path}:${f.sha256}`).join('\n'),
      ).slice(0, 16);
      const manifest = JSON.stringify({
        buildId,
        builtAt: new Date().toISOString(),
        assets: files.map((f) => f.path),
      });
      // The manifest itself stays out of its own asset list — the service
      // worker fetches it with cache: 'no-store' and stores it explicitly.
      writeFileSync(join(outDir, 'zari-build.json'), manifest);
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: 'apps/web',
  base: './',
  plugins: [react(), buildManifestPlugin()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter((dep) => !dep.includes('SpatialView') && !dep.includes('spatial3d'));
      },
    },
    rolldownOptions: {
      input: mode === 'test'
        ? { app: resolve('apps/web/index.html'), harness: resolve('apps/web/tests/harness.html') }
        : resolve('apps/web/index.html'),
    },
  },
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true },
}));
