import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

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
    baseURL: 'http://127.0.0.1:4173',
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
    command: 'npm run preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
