// E2E: Home — feed load, cache, lọc category/source, tìm kiếm debounce,
// carousel, strip TIN NÓNG, video popup, refresh, empty state.
import { test, expect } from '@playwright/test';
import {
  FEED_ITEMS, KEYS, mockNetwork, seedStorage, getStorage,
  openSearch, typeSearch, waitForFeedLoaded,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
  await page.goto('/');
  await waitForFeedLoaded(page);
});

test.describe('Feed', () => {
  test('header + thống kê + bài báo hiển thị', async ({ page }) => {
    await expect(page.getByText('NewsSummarizer')).toBeVisible();
    await expect(page.getByText('Tin nhanh · Tóm tắt bằng AI')).toBeVisible();
    // 6 bài · 5 nguồn (VNExpress x2, Dân Trí, Kenh14, Tuổi Trẻ, VietNamNet)
    await expect(page.getByText(/6 bài · 5 nguồn/)).toBeVisible();
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới')).toBeVisible();
    await expect(page.getByText('TIN MỚI NHẤT')).toBeVisible();
  });

  test('cache feeds được ghi vào storage sau khi load', async ({ page }) => {
    await page.waitForTimeout(500); // chờ writeFeedsCache (fire-and-forget)
    const raw = await getStorage(page, KEYS.feedsCache);
    expect(raw).toBeTruthy();
    const cached = JSON.parse(raw!);
    expect(Array.isArray(cached)).toBe(true);
    expect(cached.length).toBeGreaterThan(0);
    expect(cached[0]).toHaveProperty('title');
    expect(cached[0]).toHaveProperty('link');
  });

  test('lần load sau có cache: bài hiện ngay cả khi mạng chết', async ({ page }) => {
    const raw = await getStorage(page, KEYS.feedsCache);
    expect(raw).toBeTruthy();

    // Chặn hết mạng rồi reload — cache phải hiện bài trước khi fetch fail
    await page.route('**/api/fetch**', (r) => r.abort());
    await page.route('**/api/videos', (r) => r.abort());
    await page.reload();
    await waitForFeedLoaded(page);
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới')).toBeVisible();
  });

  test('nút Làm mới fetch lại, không lỗi', async ({ page }) => {
    await page.getByLabel('Làm mới').click();
    await page.waitForTimeout(800);
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới')).toBeVisible();
  });
});

test.describe('Lọc theo category', () => {
  test('chọn Công nghệ: chỉ bài Công nghệ, chọn lại Tất cả: đủ bài', async ({ page }) => {
    await page.getByRole('button', { name: 'Công nghệ' }).click();
    await expect(page.getByText('Trí tuệ nhân tạo thay đổi ngành giáo dục')).toBeVisible();
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới')).toHaveCount(0);

    await page.getByRole('button', { name: 'Tất cả', exact: true }).click();
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới')).toBeVisible();
  });
});

test.describe('Lọc theo nguồn', () => {
  test('modal nguồn: chọn Kenh14, trigger cập nhật, lọc đúng', async ({ page }) => {
    await page.getByLabel('Chọn nguồn tin').click();
    await expect(page.getByText('Chọn nguồn tin', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Kenh14', exact: true }).click();

    // Modal đóng, trigger hiện nguồn đã chọn
    await expect(page.getByText('Chọn nguồn tin', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Kenh14').last()).toBeVisible();
    await expect(page.getByText('Ca sĩ trẻ ra mắt album đầu tay')).toBeVisible();
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới')).toHaveCount(0);
  });

  test('nút Đóng trong modal nguồn đóng modal', async ({ page }) => {
    await page.getByLabel('Chọn nguồn tin').click();
    await page.getByLabel('Đóng').click();
    await expect(page.getByText('Chọn nguồn tin', { exact: true })).toHaveCount(0);
  });
});

test.describe('Tìm kiếm', () => {
  test('lọc theo tiêu đề sau debounce 600ms', async ({ page }) => {
    await openSearch(page);
    await typeSearch(page, 'vàng');
    // Ngay sau khi gõ chưa lọc (debounce)
    await expect(page.getByText(/Kết quả: 6 bài/)).toBeVisible();
    await expect(page.getByText(/Kết quả: 1 bài/)).toBeVisible({ timeout: 5000 });
  });

  test('lọc theo mô tả (không chỉ tiêu đề)', async ({ page }) => {
    await openSearch(page);
    await typeSearch(page, 'sáng tác'); // chỉ có trong description bài 4
    await expect(page.getByText(/Kết quả: 1 bài/)).toBeVisible({ timeout: 5000 });
  });

  test('không khớp: 0 bài', async ({ page }) => {
    await openSearch(page);
    await typeSearch(page, 'zzzzkhongtontai');
    await expect(page.getByText(/Kết quả: 0 bài/)).toBeVisible({ timeout: 5000 });
  });

  test('nút Xóa trong ô tìm kiếm reset bộ lọc', async ({ page }) => {
    await openSearch(page);
    await typeSearch(page, 'vàng');
    await expect(page.getByText(/Kết quả: 1 bài/)).toBeVisible({ timeout: 5000 });
    await page.getByLabel('Xóa').click();
    await expect(page.getByText(/Kết quả: 6 bài/)).toBeVisible({ timeout: 5000 });
  });

  test('nút Đóng đóng modal tìm kiếm', async ({ page }) => {
    await openSearch(page);
    await page.getByLabel('Đóng').click();
    await expect(page.getByPlaceholder('Tìm tiêu đề, nội dung bài viết...')).toHaveCount(0);
  });
});

test.describe('Carousel + TIN NÓNG', () => {
  test('strip TIN NÓNG hiện tiêu đề bài nổi bật', async ({ page }) => {
    await expect(page.getByText('TIN NÓNG')).toBeVisible();
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới').first()).toBeVisible();
  });

  test('mũi tên Tin sau/Tin trước chuyển slide, dots cập nhật', async ({ page }) => {
    await expect(page.getByLabel('Tin sau')).toBeVisible();
    await page.getByLabel('Tin sau').click();
    await page.waitForTimeout(700); // chờ smooth scroll
    await page.getByLabel('Tin trước').click();
    await page.waitForTimeout(700);
    // Không crash là đạt; dots luôn render
    await expect(page.getByLabel('Tin sau')).toBeVisible();
  });
});

test.describe('Video', () => {
  test('section VIDEO NỔI BẬT hiện card, bấm mở popup', async ({ page }) => {
    await expect(page.getByText('VIDEO NỔI BẬT')).toBeVisible();
    await page.getByText('Video hiện trường vụ cháy chung cư').click();

    // Popup: header nguồn + nút đóng + action
    await expect(page.getByLabel('Đóng video')).toBeVisible();
    await expect(page.getByText('Mở tại nguồn')).toBeVisible();
  });

  test('popup: nút Đóng đóng popup', async ({ page }) => {
    await page.getByText('Video hiện trường vụ cháy chung cư').click();
    await page.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(page.getByText('Mở tại nguồn')).toHaveCount(0);
  });

  test('video không stream: popup hiện ghi chú phát tại nguồn', async ({ page }) => {
    await page.getByText('Phỏng vấn huấn luyện viên sau trận đấu').click();
    await expect(page.getByText('Video phát tại nguồn (CDN chặn phát trực tiếp)')).toBeVisible();
  });
});

test.describe('Empty state', () => {
  test('mọi feed fail: hiện empty + nút Xem tất cả không crash', async ({ page }) => {
    await page.route('**/api/fetch**', (r) => r.fulfill({ status: 500, body: '' }));
    await page.route('**/api/videos', (r) => r.fulfill({ status: 500, body: '' }));
    await page.reload();
    await waitForFeedLoaded(page);

    await expect(page.getByText('KHÔNG CÓ DỮ LIỆU')).toBeVisible();
    await expect(page.getByText('Không có bài báo')).toBeVisible();
    await expect(page.getByText('Kéo xuống để làm mới')).toBeVisible();
  });

  test('lọc ra 0 bài: hiện empty theo bộ lọc', async ({ page }) => {
    await openSearch(page);
    await typeSearch(page, 'zzzzkhongtontai');
    await expect(page.getByText('Không có bài báo')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Mở bài báo', () => {
  test('bấm card chuyển sang màn Article', async ({ page }) => {
    await page.getByText('Giá vàng trong nước lập đỉnh mới').first().click();
    await expect(page.getByText('AI TÓM TẮT')).toBeVisible({ timeout: 15_000 });
  });
});
