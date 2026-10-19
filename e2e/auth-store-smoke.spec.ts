import { test, expect } from '@playwright/test';
import { FEED_ITEMS, KEYS, mockNetwork, seedStorage } from './helpers';

test.use({ viewport: { width: 360, height: 780 } });

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
  await seedStorage(page, { [KEYS.feedsCache]: JSON.stringify(FEED_ITEMS), [KEYS.themeMode]: 'light' });
});

test('guest can reach configured login and registration screens', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Cài đặt', exact: true }).click();
  await page.getByText('Không gian của bạn', { exact: true }).click();
  await expect(page.getByText('Giữ quyền lợi trên mọi thiết bị', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Đăng nhập để giữ quyền lợi Plus.', { exact: true })).toBeVisible();
  await expect(page.getByText('Email', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Mật khẩu', { exact: true }).first()).toBeVisible();
  await page.getByPlaceholder('ban@email.com').fill('sai@example.com');
  await page.getByPlaceholder('Ít nhất 8 ký tự').fill('12345678');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Email hoặc mật khẩu không đúng.', { exact: true })).toBeVisible();
  await page.getByText('Tạo tài khoản', { exact: true }).click();
  await expect(page.getByText('Một tài khoản cho mọi thiết bị.', { exact: true })).toBeVisible();
  await expect(page.getByText('Nhập lại mật khẩu', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('plus paywall is store-safe on web and longer briefing is gated', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Bản tin', exact: true }).click();
  await page.getByRole('button', { name: /10 phút/ }).click();
  await expect(page.getByText('NewsSummarizer Plus', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Chưa kết nối cửa hàng', { exact: true })).toBeVisible();
  await expect(page.getByText(/Thuê bao tự động gia hạn/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
