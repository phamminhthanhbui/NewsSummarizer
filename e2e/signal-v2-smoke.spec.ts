import { test, expect } from '@playwright/test';
import { mockNetwork, seedStorage, FEED_ITEMS, KEYS } from './helpers';

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
  await seedStorage(page, {
    [KEYS.feedsCache]: JSON.stringify(FEED_ITEMS),
    [KEYS.feedsCacheTime]: String(Date.now()),
    [KEYS.themeMode]: 'light',
  });
});

test('Signal V2 mobile shell and core tabs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByText(/Chào buổi/).first()).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'design-review/signal-v2-mobile.png', fullPage: true });

  await page.getByRole('tab', { name: 'Khám phá', exact: true }).click();
  const search = page.getByPlaceholder('Tìm chủ đề, nguồn tin hoặc từ khóa');
  await expect(search).toBeVisible();
  await search.fill('Trí tuệ nhân tạo');
  await expect(page.getByTestId('discoverScreen').getByTestId('feedCard').filter({ hasText: FEED_ITEMS[2].title })).toBeVisible();

  await page.getByRole('tab', { name: 'Bản tin', exact: true }).click();
  await expect(page.getByText('Tin mới, theo nhịp của bạn.')).toBeVisible();

  await page.getByRole('tab', { name: 'Thư viện', exact: true }).click();
  await expect(page.getByTestId('savedScreen')).toBeVisible();
  await expect(page.getByText('Đã lưu', { exact: true })).toBeVisible();
  await expect(page.getByText('Lịch sử', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Cài đặt', exact: true }).click();
  await expect(page.getByText('Không gian của bạn')).toBeVisible();
  await page.getByTestId('dark-mode-switch').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('@theme_mode'))).toBe('dark');
});

test('Signal V2 desktop sidebar and article reading layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');

  const nav = page.getByRole('tablist');
  const bounds = await nav.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(245);
  expect(bounds?.width).toBeLessThanOrEqual(251);
  await expect(page.getByText('news summarizer', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'design-review/signal-v2-desktop.png', fullPage: true });

  await page.getByText(FEED_ITEMS[0].title, { exact: true }).first().click();
  await expect(page.getByText('TÓM TẮT', { exact: true })).toBeVisible();
  await expect(page.getByText('KINH DOANH', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'design-review/signal-v2-article.png', fullPage: true });
});
