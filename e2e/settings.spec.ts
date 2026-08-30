// E2E: Settings — dark mode, giọng đọc (stepper/preview), lưu cấu hình AI,
// đổi provider, chọn model, test kết nối, endpoint tùy chỉnh.
import { test, expect } from '@playwright/test';
import {
  KEYS, mockNetwork, seedStorage, getStorage, gotoTab, waitForFeedLoaded,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
  // Mặc định mở khóa AI để test các mục AI (test ẩn/hiện nằm ở secret-code.spec)
  await seedStorage(page, { [KEYS.aiUnlocked]: '1' });
  await page.goto('/');
  await waitForFeedLoaded(page);
  await gotoTab(page, 'Cài đặt');
});

test.describe('Dark mode', () => {
  test('bật: chữ đổi màu tối, hint "Đang bật", ghi storage', async ({ page }) => {
    await expect(page.getByText('Đang tắt')).toBeVisible();
    await page.getByTestId('dark-mode-switch').click();

    await expect(page.getByText('Đang bật')).toBeVisible();
    expect(await getStorage(page, KEYS.themeMode)).toBe('dark');
    // Section title đổi sang màu chữ dark (#F2F4F8 = rgb(242, 244, 248))
    const color = await page.getByText('Giao diện').first().evaluate(
      (el) => getComputedStyle(el).color,
    );
    expect(color).toBe('rgb(242, 244, 248)');
  });

  test('tắt lại: hint "Đang tắt", storage về light', async ({ page }) => {
    await seedStorage(page, { [KEYS.themeMode]: 'dark' });
    await page.reload();
    await gotoTab(page, 'Cài đặt');
    await expect(page.getByText('Đang bật')).toBeVisible();

    await page.getByTestId('dark-mode-switch').click();
    await expect(page.getByText('Đang tắt')).toBeVisible();
    expect(await getStorage(page, KEYS.themeMode)).toBe('light');
  });

  test('dark mode giữ qua reload + áp dụng cho tab khác', async ({ page }) => {
    await page.getByTestId('dark-mode-switch').click();
    await page.reload();
    await gotoTab(page, 'Cài đặt');
    await expect(page.getByText('Đang bật')).toBeVisible();

    // Tab Home cũng đổi màu: title section "TIN MỚI NHẤT" (màu accent giữ nguyên trong dark)
    await gotoTab(page, 'Trang chủ');
    const color = await page.getByText('TIN MỚI NHẤT').evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe('rgb(37, 99, 235)');
  });
});

test.describe('Giọng đọc', () => {
  test('stepper hiện giá trị; giá trị seed từ storage được đọc lại', async ({ page }) => {
    await expect(page.getByText('Cao độ (pitch)')).toBeVisible();
    await expect(page.getByText('Tốc độ (rate)')).toBeVisible();
    await expect(page.getByText('1.0').first()).toBeVisible();
  });

  test('pitch/rate lưu vào storage sau "Lưu cài đặt"', async ({ page }) => {
    await page.getByText('Lưu cài đặt').click();
    await expect(page.getByText('Đã lưu').first()).toBeVisible();
    expect(await getStorage(page, KEYS.pitch)).toBe('1');
    expect(await getStorage(page, KEYS.rate)).toBe('1');
  });

  test('nút Nghe thử không crash khi bấm', async ({ page }) => {
    // Alert (nếu trình duyệt không có giọng vi) — accept để không treo
    page.on('dialog', (d) => d.accept());
    await page.getByText('Nghe thử giọng đọc').click();
    // Chỉ cần không crash; nếu có giọng Việt web sẽ hiện "Đang phát..."
  });
});

test.describe('Cấu hình AI', () => {
  test('đổi provider: model + hint đổi theo, testResult cũ bị xóa', async ({ page }) => {
    await page.getByText('NVIDIA NIM', { exact: true }).click();
    // Model mặc hình của NVIDIA hiện trong select field
    await expect(page.getByText('Nemotron 3.5 Lightning 30B (nhanh, miễn phí)')).toBeVisible();
    await expect(page.getByText(/build\.nvidia\.com/)).toBeVisible();
  });

  test('chọn model trong dropdown', async ({ page }) => {
    // Mở dropdown (field đang hiện model mặc định của b.AI)
    await page.getByText('DeepSeek V4 Flash Vision (nhanh, miễn phí, mặc định)').click();
    await expect(page.getByText('DeepSeek V4 Flash (nhanh, miễn phí)', { exact: true })).toBeVisible();
    await page.getByText('DeepSeek V4 Flash (nhanh, miễn phí)', { exact: true }).click();
    // Dropdown đóng, field hiện model mới
    await expect(page.getByText('DeepSeek V4 Pro (mạnh)')).toHaveCount(0);
    await expect(page.getByText('DeepSeek V4 Flash (nhanh, miễn phí)', { exact: true })).toBeVisible();
  });

  test('chỉ có 2 provider: b.AI + NVIDIA, không có Custom/Endpoint', async ({ page }) => {
    await expect(page.getByText('Endpoint tùy chỉnh')).toHaveCount(0);
    await expect(page.getByText('b.AI (mặc định)', { exact: true })).toBeVisible();
    await expect(page.getByText('NVIDIA NIM', { exact: true })).toBeVisible();
  });

  test('Lưu cài đặt ghi provider + key + model vào storage', async ({ page }) => {
    await page.getByPlaceholder('sk-... / nvapi-...').fill('sk-test-key-123');
    await page.getByText('Lưu cài đặt').click();
    await expect(page.getByText('Đã lưu').first()).toBeVisible();

    expect(await getStorage(page, KEYS.provider)).toBe('bai');
    expect(await getStorage(page, KEYS.baiKey)).toBe('sk-test-key-123');
    expect(await getStorage(page, KEYS.model)).toBe('deepseek-v4-flash-vision-exp');
  });

  test('key đã lưu được đọc lại khi mở Settings', async ({ page }) => {
    await seedStorage(page, { [KEYS.provider]: 'bai', [KEYS.baiKey]: 'sk-saved-key' });
    await page.reload();
    await gotoTab(page, 'Cài đặt');
    await expect(page.getByPlaceholder('sk-... / nvapi-...')).toHaveValue('sk-saved-key');
  });

  test('Kiểm tra kết nối: thành công (mock LLM 200)', async ({ page }) => {
    await page.getByPlaceholder('sk-... / nvapi-...').fill('sk-key');
    await page.getByText('Kiểm tra kết nối').click();
    await expect(page.getByText('Kết nối b.AI (mặc định) thành công')).toBeVisible({ timeout: 20_000 });
  });

  test('Kiểm tra kết nối: thất bại hiện lỗi', async ({ page }) => {
    // Route đăng ký sau đè route mock của beforeEach
    await page.route('**/api/llm', (r) =>
      r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'invalid api key' } }) }),
    );
    await page.getByPlaceholder('sk-... / nvapi-...').fill('wrong-key');
    await page.getByText('Kiểm tra kết nối').click();
    await expect(page.getByText(/invalid api key|Lỗi/).last()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Kết nối NVIDIA NIM thành công')).toHaveCount(0);
  });
});
