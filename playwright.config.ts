// E2E Playwright — chạy app Expo web (8087) + proxy (3001) rồi test trên Chromium.
// Chạy: npx playwright test (hoặc npm run test:e2e).
// Mặc định tự spawn server (webServer). Muốn bám dev server đang chạy sẵn:
//   set PLAYWRIGHT_SKIP_BROWSER_WS=1 && npx playwright test
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // 1 dev server + localStorage seed → chạy tuần tự cho ổn định
  workers: 1,
  retries: 0,
  // list = in kết quả ra console; autofix-reporter = test fail thì tự mở
  // fcc-server (nếu chưa chạy) + fcc-claude --dangerously-skip-permissions để sửa
  reporter: [['list'], ['./e2e/autofix-reporter.ts']],
  use: {
    baseURL: 'http://localhost:8087',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 430, height: 932 }, // khổ điện thoại
    actionTimeout: 15_000,
    navigationTimeout: 120_000, // lần đầu Expo bundle chậm
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_BROWSER_WS
    ? undefined
    : {
        command: 'node scripts/dev.js',
        url: 'http://localhost:8087',
        reuseExistingServer: true,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
