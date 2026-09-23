import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './apps/web/tests/browser',
  outputDir: 'test-results/browser',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'ko-KR',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.ZARI_CHROMIUM_EXECUTABLE
      ? {
          executablePath: process.env.ZARI_CHROMIUM_EXECUTABLE,
          args: JSON.parse(process.env.ZARI_CHROMIUM_ARGS_JSON ?? '[]') as string[],
        }
      : {},
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
