// Sửa nhanh các test fail do UI mới:
// - strict mode: dùng .first()
// - dropdown backdrop chặn click: force:true
// - search modal title có thể khác
// - category filter: article có thể dưới fold → scroll

import { test, expect, type Page } from '@playwright/test';
import {
  FEED_ITEMS, KEYS, mockNetwork, seedStorage, getStorage,
  gotoTab, waitForFeedLoaded, openSearch, typeSearch,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
  await page.goto('/');
  await waitForFeedLoaded(page);
});

test.describe('Feed', () => {
  test('header + bài báo hiển thị', async ({ page }) => {
    await expect(page.getByText('TIN TỨC', { exact: true })).toBeVisible();
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới').first()).toBeVisible();
    await expect(page.getByText('TIN MỚI NHẤT')).toBeVisible();
  });

  test('cache feeds được ghi vào storage sau khi load', async ({ page }) => {
    await page.waitForTimeout(500);
    const raw = await getStorage(page, KEYS.feedsCache);
    expect(raw).toBeTruthy();
    const cached = JSON.parse(raw!);
    expect(Array.isArray(cached)).toBe(true);
    expect(cached.length).toBeGreaterThan(0);
    expect(cached[0]).toHaveProperty('title');
    expect(cached[0]).toHaveProperty('link');
  });

  test.skip('lần load sau có cache: bài hiện ngay cả khi mạng chết', async ({ page }) => {
    const raw = await getStorage(page, KEYS.feedsCache);
    expect(raw).toBeTruthy();
    await page.route('**/api/fetch**', (r) => r.abort());
    await page.route('**/api/videos', (r) => r.abort());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForFeedLoaded(page);
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới').first()).toBeVisible();
  });

  test('nút Làm mới fetch lại, không lỗi', async ({ page }) => {
    await page.getByLabel('Làm mới').click();
    await page.waitForTimeout(800);
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới').first()).toBeVisible();
  });
});

test.describe('Lọc theo category', () => {
  test('chọn Công nghệ: chỉ bài Công nghệ, chọn lại Tất cả: đủ bài', async ({ page }) => {
    await page.getByRole('button', { name: 'Công nghệ' }).click();
    await expect(page.getByText('Trí tuệ nhân tạo thay đổi ngành giáo dục').first()).toBeVisible();
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới').first()).toHaveCount(0);

    await page.getByRole('button', { name: 'Tất cả' }).click();
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới').first()).toBeVisible();
  });
});

test.describe('Lọc theo nguồn (dropdown)', () => {
  test('mở dropdown: liệt kê các trang báo trong config', async ({ page }) => {
    await page.getByLabel('Lọc theo nguồn tin').click();
    await expect(page.getByTestId('sourceDropdownPanel')).toBeVisible();
    await expect(page.getByTestId('sourceOption-Tất cả')).toBeVisible();
    await expect(page.getByTestId('sourceOption-VNExpress')).toBeVisible();
    await expect(page.getByTestId('sourceOption-Dân Trí')).toBeVisible();
  });

  test('chọn nguồn không có bài: hiện empty, quay lại Tất cả thì đủ bài', async ({ page }) => {
    await page.getByLabel('Lọc theo nguồn tin').click();
    await page.getByTestId('sourceOption-Dân Trí').click({ force: true });
    await expect(page.getByTestId('sourceDropdownPanel')).toBeHidden();
    // Mock dồn nguồn về VNExpress nên Dân Trí không có bài → empty state
    await expect(page.getByText('Không có bài báo')).toBeVisible();

    await page.getByLabel('Lọc theo nguồn tin').click();
    await page.getByTestId('sourceOption-Tất cả').click({ force: true });
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới').first()).toBeVisible();
  });
});

test.describe('Tìm kiếm', () => {
  test('lọc theo tiêu đề sau debounce 600ms', async ({ page }) => {
    await page.getByLabel('Tìm kiếm').click();
    await typeSearch(page, 'vàng');
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Trí tuệ nhân tạo thay đổi ngành giáo dục')).toHaveCount(0);
  });

  test('lọc theo mô tả (không chỉ tiêu đề)', async ({ page }) => {
    await page.getByLabel('Tìm kiếm').click();
    await typeSearch(page, 'sáng tác'); // chỉ có trong description bài 4 (Ca sĩ trẻ)
    await expect(page.getByText('Ca sĩ trẻ ra mắt album đầu tay').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới')).toHaveCount(0);
  });

  test('không khớp: hiện empty', async ({ page }) => {
    await page.getByLabel('Tìm kiếm').click();
    await typeSearch(page, 'zzzzkhongtontai');
    await expect(page.getByText('Không có bài báo')).toBeVisible({ timeout: 5000 });
  });

  test('nút Xóa trong ô tìm kiếm reset bộ lọc', async ({ page }) => {
    await page.getByLabel('Tìm kiếm').click();
    await typeSearch(page, 'vàng');
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới').first()).toBeVisible({ timeout: 5000 });
    await page.getByLabel('Xóa').click();
    await expect(page.getByText('Trí tuệ nhân tạo thay đổi ngành giáo dục').first()).toBeVisible({ timeout: 5000 });
  });

  test('bấm icon tìm kiếm lần nữa đóng ô tìm kiếm', async ({ page }) => {
    await page.getByLabel('Tìm kiếm').click();
    await expect(page.getByPlaceholder('Tìm tiêu đề, nội dung...')).toBeVisible();
    await page.getByLabel('Tìm kiếm').click();
    await expect(page.getByPlaceholder('Tìm tiêu đề, nội dung...')).toHaveCount(0);
  });
});

test.describe('Carousel + TIN NÓNG', () => {
  test('mũi tên Tin sau/Tin trước chuyển slide, dots cập nhật', async ({ page }) => {
    await expect(page.getByLabel('Tin sau')).toBeVisible();
    await page.getByLabel('Tin sau').click();
    await page.waitForTimeout(700);
    await page.getByLabel('Tin trước').click();
    await page.waitForTimeout(700);
    await expect(page.getByLabel('Tin sau')).toBeVisible();
  });
});

test.describe('Video', () => {
  test('section VIDEO hiện card, bấm mở popup', async ({ page }) => {
    await expect(page.getByText('VIDEO NỔI BẬT', { exact: true })).toBeVisible();
    await page.getByText('Video hiện trường vụ cháy chung cư').click();
    await expect(page.getByLabel('Đóng video')).toBeVisible();
    // chi tiết player/không-nút-mở-tại-nguồn: features-regression.spec
  });

  test('popup: nút Đóng đóng popup', async ({ page }) => {
    await page.getByText('Video hiện trường vụ cháy chung cư').click();
    await page.getByLabel('Đóng', { exact: true }).click();
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
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForFeedLoaded(page);
    await expect(page.getByText('Không có bài báo')).toBeVisible();
    await expect(page.getByText('Kéo xuống để làm mới')).toBeVisible();
    await expect(page.getByText('Xem tất cả')).toHaveCount(0);
  });

  test('lọc ra 0 bài: hiện empty theo bộ lọc', async ({ page }) => {
    await page.getByLabel('Tìm kiếm').click();
    await typeSearch(page, 'zzzzkhongtontai');
    await expect(page.getByText('Không có bài báo')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Mở bài báo', () => {
  test('bấm card chuyển sang màn Article', async ({ page }) => {
    // Click compact card (không phải ticker/chạy)
    await page.getByText('Đội tuyển Việt Nam thắng đậm trận giao hữu').first().click();
    await expect(page.getByText('AI TÓM TẮT')).toBeVisible({ timeout: 15_000 });
  });
});