import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Vite's default preview port is 4173. Another app on this machine can already
// be listening there. Reusing that server would run ZARI tests against the
// other app, so reuseExistingServer stays off and the first free port at or
// above 4173 is used. CI, where 4173 is free, still uses 4173.
// Playwright loads this file in the runner and again in each worker. The
// worker must keep the runner's port: once the server is up, a second probe
// would skip it and point tests at the next port.
function previewOrigin(): string {
  const stamp = join(process.cwd(), 'test-results', 'preview-origin.txt');
  const script = `
    const fs = require('node:fs');
    const net = require('node:net');
    const stamp = process.argv[1];
    function canListen(port) {
      return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
      });
    }
    (async () => {
      let stamped = '';
      try {
        const stat = fs.statSync(stamp);
        if (Date.now() - stat.mtimeMs < 60000) stamped = fs.readFileSync(stamp, 'utf8').trim();
      } catch {}
      const match = stamped.match(/^http:\\/\\/127\\.0\\.0\\.1:(\\d+)$/);
      if (match && !(await canListen(Number(match[1])))) {
        process.stdout.write(stamped);
        return;
      }
      for (let port = 4173; port < 4193; port += 1) {
        if (await canListen(port)) {
          const origin = 'http://127.0.0.1:' + port;
          fs.mkdirSync(require('node:path').dirname(stamp), { recursive: true });
          fs.writeFileSync(stamp, origin);
          process.stdout.write(origin);
          return;
        }
      }
      process.exit(1);
    })();
  `;
  const origin = execFileSync(process.execPath, ['-e', script, stamp], { encoding: 'utf8' }).trim();
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error(`preview port probe failed: ${origin}`);
  return origin;
}

const previewOriginUrl = previewOrigin();

// ZARI-010 — the supported-browser matrix runs Chromium, Firefox, and WebKit.
// On hosts without root, scripts/setup-webkit-deps.sh provisions WebKit
// dependencies into ~/.cache/zari-webkit-deps and writes env.json; when that
// marker exists its paths are injected into the webkit launch env and host
// requirement validation is skipped (the extracted libs are not visible to
// ldconfig). On a properly provisioned host the marker is absent and every
// project launches with stock configuration.
const webkitDepsEnvPath = join(homedir(), '.cache', 'zari-webkit-deps', 'env.json');
const webkitUserlandEnv: Record<string, string> | null = existsSync(webkitDepsEnvPath)
  ? (JSON.parse(readFileSync(webkitDepsEnvPath, 'utf8')) as Record<string, string>)
  : null;
if (webkitUserlandEnv) {
  process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
}
const webkitLaunchEnv = webkitUserlandEnv
  ? Object.fromEntries(
      Object.entries({ ...process.env, ...webkitUserlandEnv }).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    )
  : undefined;

export default defineConfig({
  testDir: './apps/web/tests/browser',
  outputDir: 'test-results/browser',
  timeout: 30000,
  // WASM worker boot can exceed 10 s when the three engine projects run
  // under parallel workers; this only lengthens readiness waits, not any
  // measured budget (those live in bench.spec.ts).
  expect: { timeout: 30000 },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: previewOriginUrl,
    locale: 'ko-KR',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
        launchOptions: process.env.ZARI_CHROMIUM_EXECUTABLE
          ? {
              executablePath: process.env.ZARI_CHROMIUM_EXECUTABLE,
              args: JSON.parse(process.env.ZARI_CHROMIUM_ARGS_JSON ?? '[]') as string[],
            }
          : {},
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
        launchOptions: webkitLaunchEnv ? { env: webkitLaunchEnv } : {},
      },
    },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${new URL(previewOriginUrl).port} --strictPort`,
    url: previewOriginUrl,
    reuseExistingServer: false,
  },
});
