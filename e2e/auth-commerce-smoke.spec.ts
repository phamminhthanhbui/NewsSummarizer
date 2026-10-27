import { test, expect } from '@playwright/test';
import { FEED_ITEMS, KEYS, mockNetwork, seedStorage } from './helpers';

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
  await seedStorage(page, { [KEYS.feedsCache]: JSON.stringify(FEED_ITEMS), [KEYS.themeMode]: 'light' });
});

test('guest can open account and the configured Firebase login screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Cài đặt', exact: true }).click();
  await page.getByText('Không gian của bạn', { exact: true }).click();
  await expect(page.getByText('Giữ quyền lợi trên mọi thiết bị')).toBeVisible();
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Đăng nhập để giữ quyền lợi Plus.', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('ban@email.com')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('plus paywall degrades safely before store keys are configured', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Cài đặt', exact: true }).click();
  await page.getByText('Không gian của bạn', { exact: true }).click();
  await page.getByRole('button', { name: 'Khám phá NewsSummarizer Plus', exact: true }).click();
  await expect(page.getByText('Chưa kết nối cửa hàng')).toBeVisible();
  await expect(page.getByText(/Thanh toán Plus chưa mở trong phiên bản này/)).toBeVisible();
});
