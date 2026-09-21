// E2E: mã bí mật 016527 ở ô tìm kiếm Home — toggle hiện/ẩn cấu hình AI trong Settings.
// Yêu cầu bảo mật: mã KHÔNG được lộ ở bất kỳ text UI nào (không hint).
import { test, expect } from '@playwright/test';
import {
  SECRET_CODE, KEYS, mockNetwork, seedStorage, getStorage,
  gotoTab, openSearch, typeSearch, enterSecretCode, waitForFeedLoaded,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
  await page.goto('/');
  await waitForFeedLoaded(page);
});

test.describe('Mã bí mật — mở khóa', () => {
  test('nhập mã: alert mở khóa, input xóa, cờ ghi vào storage', async ({ page }) => {
    await openSearch(page);
    const msg = await enterSecretCode(page);
    expect(msg).toBe('Đã mở khóa cấu hình AI trong Cài đặt');

    // Search là thanh inline trong header (không còn modal): sau mã, input
    // bị clear (value rỗng) nhưng thanh vẫn mở — behavior mới cố ý.
    await expect(page.getByPlaceholder('Tìm tiêu đề, nội dung...')).toHaveValue('');
    expect(await getStorage(page, KEYS.aiUnlocked)).toBe('1');
  });

  test('mở khóa xong: Settings hiện đủ 4 mục AI', async ({ page }) => {
    await openSearch(page);
    await enterSecretCode(page);
    await gotoTab(page, 'Cài đặt');

    await expect(page.getByText('Nhà cung cấp AI')).toBeVisible();
    await expect(page.getByText('API Key', { exact: true })).toBeVisible();
    await expect(page.getByText('Model AI')).toBeVisible();
    await expect(page.getByText('Kiểm tra kết nối')).toBeVisible();
  });

  test('mở khóa tồn tại qua reload (không cần nhập lại)', async ({ page }) => {
    await seedStorage(page, { [KEYS.aiUnlocked]: '1' });
    await page.reload();
    await gotoTab(page, 'Cài đặt');
    await expect(page.getByText('Nhà cung cấp AI')).toBeVisible();
  });
});

test.describe('Mã bí mật — khóa lại (toggle)', () => {
  test('nhập mã lần hai: alert ẩn, cờ xóa, mục AI biến mất', async ({ page }) => {
    await seedStorage(page, { [KEYS.aiUnlocked]: '1' });
    await page.reload();
    await waitForFeedLoaded(page);

    await openSearch(page);
    const msg = await enterSecretCode(page);
    expect(msg).toBe('Đã ẩn cấu hình AI trong Cài đặt');
    expect(await getStorage(page, KEYS.aiUnlocked)).toBeNull();

    await gotoTab(page, 'Cài đặt');
    await expect(page.getByText('Nhà cung cấp AI')).toHaveCount(0);
    await expect(page.getByText('Model AI')).toHaveCount(0);
  });

  test('toggle có hiệu lực ngay khi focus lại tab Settings, không cần F5', async ({ page }) => {
    // Settings đã mount sẵn (tab navigator giữ mounted) — khóa từ Home rồi quay lại
    await seedStorage(page, { [KEYS.aiUnlocked]: '1' });
    await page.reload();
    await waitForFeedLoaded(page);
    await gotoTab(page, 'Cài đặt');
    await expect(page.getByText('Nhà cung cấp AI')).toBeVisible();

    await gotoTab(page, 'Trang chủ');
    await openSearch(page);
    await enterSecretCode(page); // khóa

    await gotoTab(page, 'Cài đặt'); // useFocusEffect phải đọc lại cờ
    await expect(page.getByText('Nhà cung cấp AI')).toHaveCount(0);
  });
});

test.describe('Mặc định ẩn + bí mật', () => {
  test('chưa nhập mã: Settings không có mục AI nào', async ({ page }) => {
    await gotoTab(page, 'Cài đặt');
    await expect(page.getByText('Nhà cung cấp AI')).toHaveCount(0);
    await expect(page.getByText('API Key', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Model AI')).toHaveCount(0);
    await expect(page.getByText('Endpoint tùy chỉnh')).toHaveCount(0);
    // Mục công khai vẫn còn
    await expect(page.getByText('Giọng đọc tiếng Việt')).toBeVisible();
    await expect(page.getByText('Giao diện')).toBeVisible();
  });

  test('mã bí mật không lộ ở bất kỳ text UI nào', async ({ page }) => {
    // Quét Home + Settings: không nơi nào hiển thị chuỗi mã
    await expect(page.locator('body')).not.toContainText(SECRET_CODE);
    await gotoTab(page, 'Cài đặt');
    await expect(page.locator('body')).not.toContainText(SECRET_CODE);
    await gotoTab(page, 'Trang chủ');
    await openSearch(page);
    await expect(page.locator('body')).not.toContainText(SECRET_CODE);
  });
});

test.describe('Regression: không "không có dữ liệu" sau khi nhập mã', () => {
  test('nhập mã xong danh sách vẫn đủ bài (debounce timer đã hủy)', async ({ page }) => {
    await openSearch(page);
    await enterSecretCode(page);

    // Chờ > 600ms — nếu bug debounce còn, timer sẽ set debouncedQuery='016527'
    // sau khi reset → lọc ra 0 bài → hiện empty state "Không có bài báo"
    await page.waitForTimeout(1200);
    await expect(page.getByText('TIN MỚI NHẤT')).toBeVisible();
    await expect(page.getByText('Không có bài báo')).toHaveCount(0);
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới').first()).toBeVisible();
  });
});

test.describe('Không phải mã — không toggle', () => {
  test('nhập chuỗi khác: không alert, không đổi cờ, lọc bình thường', async ({ page }) => {
    await openSearch(page);
    await typeSearch(page, '01652'); // thiếu 1 số
    await page.waitForTimeout(900); // debounce 600ms + dư
    await expect(page.getByPlaceholder('Tìm tiêu đề, nội dung...')).toHaveValue('01652');
    expect(await getStorage(page, KEYS.aiUnlocked)).toBeNull();

    // Nhập từ khóa thật sự vẫn lọc được — UI mới không còn nhãn "Kết quả: N bài",
    // kiểm tra list còn đúng bài khớp và bài không khớp biến mất
    await typeSearch(page, 'vàng');
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Trí tuệ nhân tạo thay đổi ngành giáo dục').first()).toHaveCount(0);
  });

  test('mã có khoảng trắng thừa vẫn được chấp nhận (trim)', async ({ page }) => {
    await openSearch(page);
    const msg = await enterSecretCode(page, ` ${SECRET_CODE} `);
    expect(msg).toBe('Đã mở khóa cấu hình AI trong Cài đặt');
  });
});
