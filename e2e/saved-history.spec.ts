// E2E: tab Đã lưu + Lịch sử — seed storage, render, xóa từng bài, xóa tất cả,
// mở bài từ list, dọn record rỗng trong history.
// Locators scope bằng testID của screen: Home tab vẫn mounted phía sau (React
// Navigation giữ tab) nên getByText không scope sẽ match cả text ẩn của Home.
import { test, expect } from '@playwright/test';
import {
  FEED_ITEMS, KEYS, mockNetwork, seedStorage, getStorage, gotoTab, waitForFeedLoaded,
} from './helpers';

const A = FEED_ITEMS[0];
const B = FEED_ITEMS[1];

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
});

test.describe('Đã lưu', () => {
  test('trống: hiện empty state', async ({ page }) => {
    await page.goto('/');
    await waitForFeedLoaded(page);
    await gotoTab(page, 'Đã lưu');
    await expect(page.getByText('Chưa có bài đã lưu')).toBeVisible();
    await expect(page.getByText('Xoá tất cả')).toHaveCount(0);
  });

  test('seed 2 bài: render đủ, nguồn + tiêu đề đúng', async ({ page }) => {
    await seedStorage(page, { [KEYS.saved]: JSON.stringify([A, B]) });
    await page.goto('/');
    await waitForFeedLoaded(page);
    await gotoTab(page, 'Đã lưu');
    const saved = page.getByTestId('savedScreen');
    await expect(saved.getByText(A.title)).toBeVisible();
    await expect(saved.getByText(B.title)).toBeVisible();
    await expect(saved.getByText('Xoá tất cả')).toBeVisible();
  });

  test('xóa 1 bài: storage cập nhật, bài còn lại giữ', async ({ page }) => {
    await seedStorage(page, { [KEYS.saved]: JSON.stringify([A, B]) });
    await page.goto('/');
    await waitForFeedLoaded(page);
    await gotoTab(page, 'Đã lưu');
    const saved = page.getByTestId('savedScreen');
    await saved.getByLabel('Bỏ lưu bài').first().click();

    await expect(saved.getByText(A.title)).toHaveCount(0);
    await expect(saved.getByText(B.title)).toBeVisible();
    const raw = await getStorage(page, KEYS.saved);
    expect(JSON.parse(raw!).map((i: any) => i.link)).toEqual([B.link]);
  });

  test('Xoá tất cả: list rỗng, storage xóa', async ({ page }) => {
    await seedStorage(page, { [KEYS.saved]: JSON.stringify([A, B]) });
    await page.goto('/');
    await waitForFeedLoaded(page);
    await gotoTab(page, 'Đã lưu');
    const saved = page.getByTestId('savedScreen');
    await saved.getByText('Xoá tất cả').click();
    await expect(saved.getByText('Chưa có bài đã lưu')).toBeVisible();
    expect(await getStorage(page, KEYS.saved)).toBeNull();
  });

  test('bấm bài đã lưu: mở màn Article', async ({ page }) => {
    await seedStorage(page, { [KEYS.saved]: JSON.stringify([A]) });
    await page.goto('/');
    await waitForFeedLoaded(page);
    await gotoTab(page, 'Đã lưu');
    await page.getByTestId('savedScreen').getByText(A.title).click();
    await expect(page.getByText('AI TÓM TẮT')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Lịch sử tóm tắt', () => {
  const HISTORY = [
    { url: A.link, title: A.title, summary: 'Tóm tắt một của bài A.', date: new Date().toISOString(), source: A.source },
    { url: B.link, title: B.title, summary: 'Tóm tắt hai của bài B.', date: new Date().toISOString(), source: B.source },
  ];

  test('trống: hiện empty state', async ({ page }) => {
    await page.goto('/');
    await waitForFeedLoaded(page);
    await gotoTab(page, 'Lịch sử');
    await expect(page.getByText('Chưa có lịch sử tóm tắt')).toBeVisible();
    await expect(page.getByText('Mở bài báo đầu tiên để bắt đầu tóm tắt')).toBeVisible();
  });

  test('seed: render tiêu đề + summary', async ({ page }) => {
    await seedStorage(page, { [KEYS.history]: JSON.stringify(HISTORY) });
    await page.goto('/');
    await waitForFeedLoaded(page);
    await gotoTab(page, 'Lịch sử');
    const hist = page.getByTestId('historyScreen');
    await expect(hist.getByText(A.title)).toBeVisible();
    await expect(hist.getByText('Tóm tắt một của bài A.')).toBeVisible();
    await expect(hist.getByText(B.title)).toBeVisible();
  });

  test('record summary rỗng bị dọn khỏi storage khi focus tab', async ({ page }) => {
    const dirty = [...HISTORY, { url: 'https://example.com/rong', title: 'Rỗng', summary: '   ', date: new Date().toISOString(), source: 'VNExpress' }];
    await seedStorage(page, { [KEYS.history]: JSON.stringify(dirty) });
    await page.goto('/');
    await waitForFeedLoaded(page);
    await gotoTab(page, 'Lịch sử');
    const hist = page.getByTestId('historyScreen');

    await expect(hist.getByText('Rỗng')).toHaveCount(0);
    await expect(async () => {
      const raw = await getStorage(page, KEYS.history);
      expect(JSON.parse(raw!).length).toBe(2);
    }).toPass({ timeout: 5_000 });
  });

  test('Xoá tất cả: list rỗng, storage xóa', async ({ page }) => {
    await seedStorage(page, { [KEYS.history]: JSON.stringify(HISTORY) });
    await page.goto('/');
    await waitForFeedLoaded(page);
    await gotoTab(page, 'Lịch sử');
    const hist = page.getByTestId('historyScreen');
    await hist.getByText('Xoá tất cả').click();
    await expect(hist.getByText('Chưa có lịch sử tóm tắt')).toBeVisible();
    expect(await getStorage(page, KEYS.history)).toBeNull();
  });

  test('bấm item lịch sử: mở màn Article', async ({ page }) => {
    await seedStorage(page, { [KEYS.history]: JSON.stringify(HISTORY) });
    await page.goto('/');
    await waitForFeedLoaded(page);
    await gotoTab(page, 'Lịch sử');
    await page.getByTestId('historyScreen').getByText(A.title).click();
    await expect(page.getByText('AI TÓM TẮT')).toBeVisible({ timeout: 15_000 });
  });
});
