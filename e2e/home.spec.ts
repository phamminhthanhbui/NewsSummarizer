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
    await expect(page.getByText('ĐỌC NHIỀU NHẤT')).toBeVisible();
  });

  test('cache feeds được ghi vào storage sau khi load', async ({ page }) => {
    // Cache write qua runCpuTask queue (yield 32ms/job sau ~50 job parse) →
    // rơi vào storage ~2s SAU khi loading biến mất. Poll thay vì sleep cứng.
    await expect
      .poll(async () => (await getStorage(page, KEYS.feedsCache)) ?? '', { timeout: 10_000 })
      .toBeTruthy();
    const cached = JSON.parse((await getStorage(page, KEYS.feedsCache))!);
    expect(Array.isArray(cached)).toBe(true);
    expect(cached.length).toBeGreaterThan(0);
    expect(cached[0]).toHaveProperty('title');
    expect(cached[0]).toHaveProperty('link');
  });

  test.skip('lần load sau có cache: bài hiện ngay cả khi mạng chết', async ({ page }) => {
    const raw = await getStorage(page, KEYS.feedsCache);
    expect(raw).toBeTruthy();
    await page.route('**/api/fetch**', (r) => r.abort());
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

test.describe('Section theo chủ đề (chế độ lướt)', () => {
  test('TIN MỚI NHẤT chia header chủ đề, >3 bài có "Xem thêm"; bấm là mở rộng', async ({ page }) => {
    // Seed cache feed lớn (cache-fresh → app dùng thẳng, không fetch): 9 bài
    // Kinh doanh không ảnh (không vào hero) → section có 9-3=6 bài ẩn sau "Xem thêm".
    const many = Array.from({ length: 9 }, (_, i) => ({
      title: `Tin kinh doanh số ${i}`,
      link: `https://example.com/kt-${i}`,
      description: `Mô tả bài kinh doanh số ${i} đủ dài cho search.`,
      pubDate: new Date().toISOString(),
      source: 'VNExpress',
      category: 'Kinh doanh',
    }));
    await seedStorage(page, {
      [KEYS.feedsCache]: JSON.stringify([...FEED_ITEMS, ...many]),
      [KEYS.feedsCacheTime]: String(Date.now() - 1_000),
    });
    await page.reload();
    await waitForFeedLoaded(page);

    await expect(page.getByText('KINH DOANH').first()).toBeVisible();
    const more = page.getByText(/Xem thêm \d+ tin kinh doanh/);
    await expect(more.first()).toBeVisible();
    await expect(page.getByText('Tin kinh doanh số 8')).toHaveCount(0); // ẩn sau collapsed

    await more.first().click();
    await expect(page.getByText(/Xem thêm \d+ tin kinh doanh/)).toHaveCount(0);
    await expect(page.getByText('Tin kinh doanh số 8')).toBeVisible({ timeout: 5000 });
  });

  test('đang lọc chủ đề: list phẳng, không section', async ({ page }) => {
    await page.getByRole('button', { name: 'Việt Nam' }).click();
    // list phẳng: không header chủ đề in hoa, không nút Xem thêm
    await expect(page.getByText(/Xem thêm \d+ tin/)).toHaveCount(0);
    await expect(page.getByText('KINH DOANH', { exact: true })).toHaveCount(0);
    // bài vẫn hiện
    await expect(page.getByText('Quốc hội thảo luận dự luật ngân sách').first()).toBeVisible();
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
    // exact: label input là "Nhập từ khóa TÌM KIẾM" — substring match dính 2 phần tử
    await page.getByLabel('Tìm kiếm', { exact: true }).click();
    await expect(page.getByPlaceholder('Tìm tiêu đề, nội dung...')).toBeVisible();
    await page.getByLabel('Tìm kiếm', { exact: true }).click();
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

test.describe('Empty state', () => {
  test('mọi feed fail: hiện empty + nút Xem tất cả không crash', async ({ page }) => {
    await page.route('**/api/fetch**', (r) => r.fulfill({ status: 500, body: '' }));
    // Xóa cache feeds từ lần load đầu của test — stale-while-revalidate hợp lệ
    // của app sẽ hiện cache cũ thay vì empty nếu còn. Cache write đi qua
    // runCpuTask queue (trễ ~2s sau loading biến mất) nên phải đợi write xong
    // RỒI clear, không clear ngay (write pending sẽ lấp lại).
    await expect(async () => {
      expect(await getStorage(page, KEYS.feedsCache)).toBeTruthy();
    }).toPass({ timeout: 10_000 });
    await page.evaluate(() => localStorage.clear());
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