import { defineConfig } from '@playwright/test';

const externalBaseUrl = process.env.METEORA_E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  testMatch: 'meteora-range.spec.ts',
  timeout: 90_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL: externalBaseUrl ?? 'http://127.0.0.1:19007',
    browserName: 'chromium',
    viewport: { width: 495, height: 799 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command: 'EXPO_NO_TELEMETRY=1 pnpm exec expo start --web --port 19007',
          url: 'http://127.0.0.1:19007',
          timeout: 240_000,
          reuseExistingServer: false,
        },
      }),
});
