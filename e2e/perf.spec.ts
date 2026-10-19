// E2E: Performance — verify fast paths for reload and article summary/media.
// Các test này kiểm tra BEHAVIOR (fast path được dùng), không đo thời gian thực.
import { test, expect, type Page } from '@playwright/test';
import {
  FEED_ITEMS, KEYS, SUMMARY_TEXT, mockNetwork, seedStorage, getStorage,
  gotoTab, waitForFeedLoaded,
} from './helpers';

const FIRST = FEED_ITEMS[0];

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
});

// ════════════════════════════════════════════════════════════════════
// Issue 1: Reload rất lâu — cache-fresh reload không fetch lại 18 feed
// ════════════════════════════════════════════════════════════════════
test.describe('Reload nhanh (cache fresh)', () => {
  test('reload với cache còn hạn: không gọi /api/fetch nào (cache-local, skip network)', async ({ page }) => {
    await seedStorage(page, {
      [KEYS.feedsCache]: JSON.stringify(FEED_ITEMS.slice(0, 3)),
      [KEYS.feedsCacheTime]: String(Date.now() - 1_000),
    });
    let fetchCalls = 0;
    await page.route('**/api/fetch**', (route) => {
      fetchCalls++;
      route.fallback();
    });
    await page.goto('/');
    // refresh:false — test này kiểm "cache còn hạn thì KHÔNG gọi /api/fetch",
    // nên không được bấm Làm mới (sẽ tự tạo request). Chờ cache render xong.
    await waitForFeedLoaded(page, { refresh: false });
    await expect(page.getByText(FIRST.title).first()).toBeVisible();
    await page.waitForTimeout(2000);
    expect(fetchCalls).toBe(0);
  });

  test('reload KHÔNG cache: vẫn fetch feed, bài hiện sau khi partial đầu tiên', async ({ page }) => {
    await page.goto('/');
    await waitForFeedLoaded(page);
    await expect(page.getByText(FIRST.title).first()).toBeVisible();
  });
});

// ════════════════════════════════════════════════════════════════════
// Issue 3: Summarize/rất lâu + hình/video xuất hiện rất lâu
// — hero ảnh từ feed item hiện ngay, summary từ description nhanh
// ════════════════════════════════════════════════════════════════════
test.describe('Article: hero + summary xuất hiện nhanh', () => {
  test('hero image từ feed item hiện ngay (trước khi Jina/HTML kịp trả)', async ({ page }) => {
    // Jina trả chậm (5s) — hero ảnh từ item.image phải hiện sớm hơn
    await page.route('**/api/jina**', async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.fulfill({ status: 200, contentType: 'text/markdown', body: 'Bài viết chậm.\n\nNội dung.' });
    });
    await page.goto('/');
    await waitForFeedLoaded(page);
    // Mở bài đầu tiên
    await page.getByText(FIRST.title).first().click();
    // Hero image từ item.image (FEED_ITEMS[0].image = placehold.co/Bai+1) phải
    // nằm TRONG DOM ngay (trước khi Jina 5s kịp trả) — khẳng định hero hiển thị
    // không chờ Jina/HTML. (Placehold có thể coi là "hidden" do decode khoảng trắng
    // trong query, nên dùng count thay vì toBeVisible.)
    await expect(page.locator('img[src*="Bai+1"]').first()).toHaveCount(1, { timeout: 5000 });
    // Summary (mock LLM) cũng hiện nhanh từ description
    await expect(page.getByText('Tóm tắt AI giả lập', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('fetchArticleMedia không fetch HTML trùng (cache reused)', async ({ page }) => {
    // Đếm số lần /api/fetch trỏ tới BÀI viết (không phải RSS feed).
    // fetchArticleMedia + loadArticleContent dùng chung media cache →
    // HTML của bài chỉ được fetch 1 lần.
    let articleFetch = 0;
    await page.route('**/api/fetch**', (route) => {
      const url = decodeURIComponent(route.request().url());
      if (url.includes(FIRST.link)) articleFetch++;
      route.fallback(); // trả cho handler đăng ký sau (mockNetwork) xử lý
    });
    await page.goto('/');
    await waitForFeedLoaded(page);
    await page.getByText(FIRST.title).first().click();
    await expect(page.getByText('AI TÓM TẮT')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2000);
    expect(articleFetch).toBeLessThanOrEqual(1);
  });
});