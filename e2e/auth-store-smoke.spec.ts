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
  await expect(page.getByRole('button', { name: 'Tiếp tục với Google', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tiếp tục với Apple', exact: true })).toHaveCount(0);
  await page.getByPlaceholder('ban@email.com').fill('sai@example.com');
  await page.getByPlaceholder('Mật khẩu của bạn').fill('12345678');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Email hoặc mật khẩu không đúng.', { exact: true })).toBeVisible();
  await page.getByText('Tạo tài khoản', { exact: true }).click();
  await expect(page.getByText('Một tài khoản cho mọi thiết bị.', { exact: true })).toBeVisible();
  await expect(page.getByText('Nhập lại mật khẩu', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('login validates email and password before calling the provider', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Cài đặt', exact: true }).click();
  await page.getByText('Không gian của bạn', { exact: true }).click();
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();

  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Nhập email của bạn.', { exact: true })).toBeVisible();

  await page.getByPlaceholder('ban@email.com').fill('khong-phai-email');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Địa chỉ email không hợp lệ.', { exact: true })).toBeVisible();

  await page.getByText('Quên mật khẩu?', { exact: true }).click();
  await expect(page.getByText('Khôi phục quyền truy cập.', { exact: true })).toBeVisible();
  await page.getByPlaceholder('ban@email.com').last().fill('khong-phai-email');
  await page.getByRole('button', { name: 'Gửi liên kết đặt lại', exact: true }).click();
  await expect(page.getByText('Địa chỉ email không hợp lệ.', { exact: true }).last()).toBeVisible();
});

test('plus paywall is store-safe on web and longer briefing is gated', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Bản tin', exact: true }).click();
  await page.getByRole('button', { name: /10 phút/ }).click();
  await expect(page.getByText('NewsSummarizer Plus', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Chưa kết nối cửa hàng', { exact: true })).toBeVisible();
  await expect(page.getByText(/Thuê bao tự động gia hạn theo chu kỳ hiển thị/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
