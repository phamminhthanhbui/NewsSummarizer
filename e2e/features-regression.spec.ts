// E2E: các case regression phát sinh từ review — cache jina, ticker NÓNG
// marquee nhân đôi, ĐỌC NHIỀU NHẤT theo filter, ảnh fail load không crash.
import { test, expect, type Page } from '@playwright/test';
import {
  FEED_ITEMS, JINA_MARKDOWN, SUMMARY_TEXT, KEYS, mockNetwork, getStorage, waitForFeedLoaded,
} from './helpers';

const FIRST = FEED_ITEMS[0];

async function openFirstArticle(page: Page) {
  await page.getByText(FIRST.title).first().click();
  await expect(page.getByText('AI TÓM TẮT')).toBeVisible({ timeout: 15_000 });
}

// Override route Jina đăng ký SAU mockNetwork → thắng route mặc định
function mockJina(page: Page, md: string) {
  return page.route('**/api/jina**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/markdown', body: md }),
  );
}

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
  await page.goto('/');
  await waitForFeedLoaded(page);
});

test.describe('Cache nội dung bài (jina)', () => {
  test('mở lại bài: /api/jina không gọi lại lần hai cho cùng URL', async ({ page }) => {
    let jinaCalls = 0;
    await page.route('**/api/jina**', async (route) => {
      const reqUrl = decodeURIComponent(route.request().url());
      if (reqUrl.includes(FIRST.link)) {
        jinaCalls++;
        await route.fulfill({ status: 200, contentType: 'text/markdown', body: JINA_MARKDOWN });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'text/markdown', body: JINA_MARKDOWN });
    });

    await openFirstArticle(page);
    await expect(page.getByText(SUMMARY_TEXT)).toBeVisible({ timeout: 20_000 });
    const afterFirst = jinaCalls;
    expect(afterFirst).toBeGreaterThanOrEqual(1);

    // Quay Home mở lại — contentCache in-memory hit, không gọi jina thêm
    await page.getByLabel('Quay lại').click();
    await expect(page.getByText('ĐỌC NHIỀU NHẤT')).toBeVisible({ timeout: 10_000 });
    await page.getByText(FIRST.title).first().click();
    await expect(page.getByText('AI TÓM TẮT')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2000);
    expect(jinaCalls).toBe(afterFirst);
  });
});

test.describe('Ticker NÓNG — marquee nhân đôi heroes', () => {
  test('ticker chạy nội dung heroes ×2 (loop mượt); tin thường không nằm trong ticker', async ({ page }) => {
    await expect(page.getByText('NÓNG')).toBeVisible({ timeout: 15_000 });
    // Hero title: hero card (1) + marquee nhân đôi (2) = 3 node
    await expect(async () => {
      const n = await page.getByText(FIRST.title).count();
      expect(n).toBeGreaterThanOrEqual(3);
    }).toPass({ timeout: 10_000 });
    // Tin thường (không hero): chỉ nằm ở list chính + ĐỌC NHIỀU, không nằm ticker
    // → tổng node thấp hơn rõ rệt so với hero title (marquee chỉ chạy heroes)
    const heroCount = await page.getByText(FIRST.title).count();
    const normalCount = await page.getByText(FEED_ITEMS[1].title).count();
    expect(heroCount).toBeGreaterThan(normalCount);
  });
});

test.describe('ĐỌC NHIỀU NHẤT theo filter', () => {
  // 8 bài Sức khỏe "mới" (hero 5 + list 3) — trending sẽ là 3 bài cuối
  const skItem = (i: number) => ({
    title: `Sức khỏe cập nhật số ${i}`,
    link: `https://example.com/sk-${i}`,
    description: `Tin sức khỏe thứ ${i} dùng cho test filter đọc nhiều nhất.`,
    pubDate: new Date(Date.now() - i * 3600_000).toISOString(),
    image: `https://placehold.co/600x400/2563EB/FFFFFF?text=SK${i}`,
    source: 'Tuổi Trẻ',
    category: 'Sức khỏe',
  });
  const SK_FEED = Array.from({ length: 8 }, (_, i) => skItem(i + 1));

  async function overrideRss(page: Page, categoryKeyword: RegExp, items: typeof SK_FEED) {
    await page.route('**/api/fetch**', async (route) => {
      const reqUrl = decodeURIComponent(route.request().url());
      if (categoryKeyword.test(reqUrl)) {
        const xml = `<?xml version="1.0"?><rss><channel>${items.map((i) => `
          <item><title><![CDATA[${i.title}]]></title><link>${i.link}</link>
          <pubDate>${i.pubDate}</pubDate>
          <description><![CDATA[${i.description}]]></description>
          <enclosure url="${i.image}" type="image/jpeg"/></item>`).join('')}
        </channel></rss>`;
        await route.fulfill({ status: 200, contentType: 'application/rss+xml', body: xml });
        return;
      }
      await route.fallback();
    });
  }

  test('category có 8 bài: trending chỉ gồm 3 bài ngoài top-5 hero', async ({ page }) => {
    await overrideRss(page, /suc-khoe|hellobacsi|suckhoedoisong/i, SK_FEED);
    await page.goto('/');
    await waitForFeedLoaded(page);
    await page.getByText('Sức khỏe', { exact: true }).first().click();

    // exact: tiêu đề mock SK chứa "...filter đọc nhiều" (chứa 'ĐỌC NHIỀU NHẤT'
    // như substring) → không exact sẽ dính cả 3 card trending
    await expect(page.getByText('ĐỌC NHIỀU NHẤT', { exact: true })).toBeVisible({ timeout: 15_000 });
    // .first: tiêu đề có thể hiện ở cả trending card + hero/list trong viewport
    await expect(page.getByText('Sức khỏe cập nhật số 6').first()).toBeVisible();
    await expect(page.getByText('Sức khỏe cập nhật số 7').first()).toBeVisible();
    await expect(page.getByText('Sức khỏe cập nhật số 8').first()).toBeVisible();
  });

  // Thứ tự trong strip do rankTrending quyết định — logic đó có self-check
  // riêng ở src/services/trending.test.ts (node, xác định, không phụ thuộc
  // timing/feed cache như ở đây). E2E chỉ kiểm phần nối mà unit test không phủ:
  // mở bài có thật sự ghi lượt đọc không.
  test('mở bài: ghi lượt đọc vào storage (nguồn cho ĐỌC NHIỀU NHẤT)', async ({ page }) => {
    await openFirstArticle(page);
    await expect(async () => {
      const raw = await getStorage(page, KEYS.readCounts);
      expect(raw && JSON.parse(raw)[FIRST.link]).toBe(1);
    }).toPass({ timeout: 15_000 });
  });

  test('category rỗng: section ĐỌC NHIỀU NHẤT ẩn theo filter', async ({ page }) => {
    await page.goto('/');
    await waitForFeedLoaded(page);
    // Công nghệ chỉ có 1 bài (FEED_ITEMS[3] là Giải trí; Công nghệ = item 3? dùng
    // category không có bài nào trong fixture: 'Thể thao' có 1 bài — vẫn < ngưỡng
    // trending? trending = rest có ảnh → 0 sau khi hero lấy bài duy nhất.
    await page.getByText('Thể thao', { exact: true }).first().click();
    await expect(page.getByText('ĐỌC NHIỀU NHẤT')).toHaveCount(0);
  });
});

test.describe('Ảnh fail load không crash', () => {
  test('ảnh bị chặn network: block unmount sạch, app vẫn dùng được', async ({ page }) => {
    // blocked.example.net bị catch-all abort → onError → SafeImg unmount
    // URL ảnh PHẢI có đuôi file (.png) — isEditorialImage chặn URL không đuôi
    // (chống <a> giả ![Image N](bai.html) của Jina) nên mock phải giống ảnh thật.
    await mockJina(page, `![Ảnh load được](https://placehold.co/600x400/00AA00/FFFFFF.png?text=OkImg)

Đoạn văn sau ảnh load được, xác nhận bố cục không vỡ khi một ảnh khác bị lỗi.

![Ảnh bị chặn](https://blocked.example.net/never-loads.jpg)

Đoạn văn sau ảnh lỗi. Block ảnh lỗi phải biến mất hoàn toàn cùng caption, không để lỗ trắng hay crash app.`);

    await openFirstArticle(page);
    await expect(page.locator('img[src*="OkImg"]').first()).toBeVisible({ timeout: 15_000 });
    // Ảnh lỗi unmount sau onError
    await expect(page.locator('img[src*="blocked.example.net"]')).toHaveCount(0);
    await expect(page.getByText('never-loads.jpg')).toHaveCount(0);
    // App không crash: vẫn điều hướng được
    await page.getByLabel('Quay lại').click();
    await expect(page.getByText('ĐỌC NHIỀU NHẤT')).toBeVisible({ timeout: 10_000 });
  });
});
