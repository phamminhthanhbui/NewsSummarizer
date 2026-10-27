import { test, expect } from '@playwright/test';
import { FEED_ITEMS, KEYS, mockNetwork, seedStorage } from './helpers';

test.use({ viewport: { width: 360, height: 780 } });
test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
  await seedStorage(page, { [KEYS.feedsCache]: JSON.stringify(FEED_ITEMS), [KEYS.themeMode]: 'light' });
});

test('Free and Plus are visible in Settings and Free opens registration', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Cài đặt', exact: true }).click();
  await expect(page.getByTestId('membership-free-card')).toBeVisible();
  await expect(page.getByTestId('membership-plus-card')).toBeVisible();
  await expect(page.getByTestId('membership-free-card').getByText('Tài khoản Free')).toBeVisible();
  await expect(page.getByTestId('membership-plus-card').getByText('NewsSummarizer Plus')).toBeVisible();
  await page.getByTestId('membership-free-card').click();
  await expect(page.getByText('Một tài khoản cho mọi thiết bị.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('Plus in Settings opens comparison and does not show unconfigured checkout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Cài đặt', exact: true }).click();
  await page.getByTestId('membership-plus-card').click();
  await expect(page.getByText('Chọn Free hoặc nâng cấp Plus.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('membership-free-card').last().getByText('Nghe bản tin 5 phút')).toBeVisible();
  await expect(page.getByTestId('membership-plus-card').last().getByText('Mở bản tin dài 10 và 15 phút')).toBeVisible();
  await expect(page.getByText('Chưa kết nối cửa hàng', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tiếp tục với cửa hàng' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
