// E2E: các case regression phát sinh từ review — cache jina, video featured v2
// (strip/expand/modal stream), ticker NÓNG marquee nhân đôi, ĐỌC NHIỀU NHẤT theo
// filter, ảnh fail load không crash.
//
// Lưu ý: logic "newest-first + seed" của video nằm ở SERVER (/api/videos —
// videoCrawler crawl + pickNewestFeatured). Mock /api/videos trả list tĩnh nên
// e2e chỉ assert hành vi CLIENT: slice 6/12, toggle expand, modal stream.
import { test, expect, type Page } from '@playwright/test';
import {
  FEED_ITEMS, VIDEO_ITEMS, JINA_MARKDOWN, SUMMARY_TEXT, mockNetwork, waitForFeedLoaded,
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

const vid = (i: number) => `https://placehold.co/320x180/ABCDEF/111111?text=Vid${i}`;
const vidItem = (i: number) => ({
  title: `Video thể thao số ${i}`,
  link: `https://example.com/video-${i}`,
  thumb: vid(i),
  duration: `0${i % 10}:1${i % 10}`,
  zone: 'Video nổi bật',
  source: 'VNExpress',
  stream: i % 2 === 0 ? `https://example.com/stream/video-${i}.mp4` : '',
});

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
    await expect(page.getByText('TIN MỚI NHẤT')).toBeVisible({ timeout: 10_000 });
    await page.getByText(FIRST.title).first().click();
    await expect(page.getByText('AI TÓM TẮT')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2000);
    expect(jinaCalls).toBe(afterFirst);
  });
});

test.describe('Video nổi bật v2 — strip/expand', () => {
  test('collapsed: strip chỉ hiện 6 video đầu, phần dư bị cắt', async ({ page }) => {
    await page.route('**/api/videos', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ videos: Array.from({ length: 9 }, (_, i) => vidItem(i + 1)) }),
      }),
    );
    await page.goto('/');
    await waitForFeedLoaded(page);

    await expect(page.locator('img[src*="placehold.co"][src*="Vid"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('img[src*="placehold.co"][src*="Vid"]')).toHaveCount(6);
    await expect(page.getByText('Video thể thao số 1')).toBeVisible();
    await expect(page.getByText('Video thể thao số 7')).toHaveCount(0);
    await expect(page.getByText('Video thể thao số 9')).toHaveCount(0);
  });

  test('nút "Xem thêm video": mở lưới đủ 14; "Thu gọn video" về 6', async ({ page }) => {
    await page.route('**/api/videos', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ videos: Array.from({ length: 14 }, (_, i) => vidItem(i + 1)) }),
      }),
    );
    await page.goto('/');
    await waitForFeedLoaded(page);

    await expect(page.locator('img[src*="placehold.co"][src*="Vid"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('img[src*="placehold.co"][src*="Vid"]')).toHaveCount(6);

    await page.getByLabel('Xem thêm video').click();
    await expect(page.locator('img[src*="placehold.co"][src*="Vid"]')).toHaveCount(14);
    await expect(page.getByText('Video thể thao số 14')).toBeVisible();

    await page.getByLabel('Thu gọn video').click();
    await expect(page.locator('img[src*="placehold.co"][src*="Vid"]')).toHaveCount(6);
  });

  test('video CÓ stream: modal phát trực tiếp, không hiện nút "Mở video tại nguồn"', async ({ page }) => {
    // VIDEO_ITEMS[0] có stream m3u8 (đã mock **/*.m3u8 trong helpers)
    await page.getByText(VIDEO_ITEMS[0].title).first().click();
    // Modal mở: tiêu đề video xuất hiện lần 2 (card + modal) và player mount
    await expect(page.getByText(VIDEO_ITEMS[0].title).nth(1)).toBeVisible({ timeout: 10_000 });
    // Có stream → KHÔNG hiện nút mở tại nguồn (case không-stream đã có ở home.spec)
    await expect(page.getByLabel('Mở video tại nguồn')).toHaveCount(0);
    await expect(page.getByText(VIDEO_ITEMS[0].zone, { exact: true }).first()).toBeVisible();
    // (Đóng modal đã cover ở home.spec 'popup: nút Đóng đóng popup')
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

    await expect(page.getByText('ĐỌC NHIỀU NHẤT')).toBeVisible({ timeout: 15_000 });
    // 3 bài ngoài top-5 (SK6..SK8) nằm trong ĐỌC NHIỀU NHẤT
    await expect(page.getByText('Sức khỏe cập nhật số 6')).toBeVisible();
    await expect(page.getByText('Sức khỏe cập nhật số 7')).toBeVisible();
    await expect(page.getByText('Sức khỏe cập nhật số 8')).toBeVisible();
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
    await mockJina(page, `![Ảnh load được](https://placehold.co/600x400/00AA00/FFFFFF?text=OkImg)

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
    await expect(page.getByText('TIN MỚI NHẤT')).toBeVisible({ timeout: 10_000 });
  });
});
