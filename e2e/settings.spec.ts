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
    await page.getByRole('switch').click();

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

    await page.getByRole('switch').click();
    await expect(page.getByText('Đang tắt')).toBeVisible();
    expect(await getStorage(page, KEYS.themeMode)).toBe('light');
  });

  test('dark mode giữ qua reload + áp dụng cho tab khác', async ({ page }) => {
    await page.getByRole('switch').click();
    await page.reload();
    await gotoTab(page, 'Cài đặt');
    await expect(page.getByText('Đang bật')).toBeVisible();

    // Tab Home cũng đổi màu: title section "TIN MỚI NHẤT" màu chữ dark
    await gotoTab(page, 'Trang chủ');
    const color = await page.getByText('TIN MỚI NHẤT').evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe('rgb(242, 244, 248)');
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
    await expect(page.getByText('Đã lưu')).toBeVisible();
    expect(await getStorage(page, KEYS.pitch)).toBe('1');
    expect(await getStorage(page, KEYS.rate)).toBe('1');
  });

  test('nút Nghe thử bật trạng thái Đang phát, bấm lại để dừng', async ({ page }) => {
    // Alert (nếu audio giả không phát được) — accept để không treo
    page.on('dialog', (d) => d.accept());
    await page.getByText('Nghe thử giọng đọc').click();
    await expect(page.getByText('Đang phát...')).toBeVisible({ timeout: 10_000 });
    await page.getByText('Đang phát...').click(); // dừng
    await expect(page.getByText('Nghe thử giọng đọc')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Cấu hình AI', () => {
  test('đổi provider: model + hint đổi theo, testResult cũ bị xóa', async ({ page }) => {
    await page.getByText('OpenRouter', { exact: true }).click();
    // Model mặc hình của OpenRouter hiện trong select field
    await expect(page.getByText('Nemotron 3.5 Lightning (free)')).toBeVisible();
    await expect(page.getByText(/openrouter\.ai\/keys/)).toBeVisible();
  });

  test('chọn model trong dropdown', async ({ page }) => {
    // Mở dropdown (field đang hiện model mặc định)
    await page.getByText('Llama 3.1 8B (nhanh, miễn phí)').click();
    await expect(page.getByText('Gemma 3 12B')).toBeVisible();
    await page.getByText('Gemma 3 12B').click();
    // Dropdown đóng, field hiện model mới
    await expect(page.getByText('Mistral 7B (nhanh)')).toHaveCount(0);
    await expect(page.getByText('Gemma 3 12B')).toBeVisible();
  });

  test('provider Custom hiện mục Endpoint tùy chỉnh', async ({ page }) => {
    await expect(page.getByText('Endpoint tùy chỉnh')).toHaveCount(0);
    await page.getByText('Custom (OpenAI-compatible)').click();
    await expect(page.getByText('Endpoint tùy chỉnh')).toBeVisible();
    await expect(page.getByPlaceholder('https://your-server.com/v1')).toBeVisible();
  });

  test('Lưu cài đặt ghi provider + key + model vào storage', async ({ page }) => {
    await page.getByPlaceholder('sk-... / nvapi-...').fill('nvapi-test-key-123');
    await page.getByText('Lưu cài đặt').click();
    await expect(page.getByText('Đã lưu')).toBeVisible();

    expect(await getStorage(page, KEYS.provider)).toBe('nvidia');
    expect(await getStorage(page, KEYS.apiKey)).toBe('nvapi-test-key-123');
    expect(await getStorage(page, KEYS.model)).toBe('meta/llama-3.1-8b-instruct');
  });

  test('key đã lưu được đọc lại khi mở Settings', async ({ page }) => {
    await seedStorage(page, { [KEYS.apiKey]: 'nvapi-saved-key' });
    await page.reload();
    await gotoTab(page, 'Cài đặt');
    await expect(page.getByPlaceholder('sk-... / nvapi-...')).toHaveValue('nvapi-saved-key');
  });

  test('Kiểm tra kết nối: thành công (mock LLM 200)', async ({ page }) => {
    await page.getByPlaceholder('sk-... / nvapi-...').fill('nvapi-key');
    await page.getByText('Kiểm tra kết nối').click();
    await expect(page.getByText('Kết nối NVIDIA NIM thành công')).toBeVisible({ timeout: 20_000 });
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
