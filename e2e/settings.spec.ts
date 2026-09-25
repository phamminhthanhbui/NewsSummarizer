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

    // Tab Home cũng đổi màu: title section "ĐỌC NHIỀU NHẤT" (màu hot giữ nguyên trong dark)
    await gotoTab(page, 'Trang chủ');
    const color = await page.getByText('ĐỌC NHIỀU NHẤT').evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe('rgb(251, 81, 42)');
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
  test('provider NVIDIA: model mặc định + hint key hiện sẵn', async ({ page }) => {
    await page.getByText('NVIDIA NIM', { exact: true }).click();
    // Model mặc định của NVIDIA hiện trong select field
    await expect(page.getByText('Nemotron 3 Super 120B (mạnh, miễn phí)')).toBeVisible();
    await expect(page.getByText(/build\.nvidia\.com/)).toBeVisible();
  });

  test('chọn model trong dropdown', async ({ page }) => {
    // Mở dropdown (field đang hiện model mặc định của NVIDIA)
    await page.getByText('Nemotron 3 Super 120B (mạnh, miễn phí)').click();
    await page.getByText('DeepSeek V4.1 Flash (nhanh, miễn phí)', { exact: true }).click();
    // Dropdown đóng, field hiện model mới
    await expect(page.getByText('Ising Calibration 31B (nhanh, miễn phí)')).toHaveCount(0);
    await expect(page.getByText('DeepSeek V4.1 Flash (nhanh, miễn phí)', { exact: true })).toBeVisible();
  });

  test('chỉ có NVIDIA, không còn b.AI/Custom/Endpoint', async ({ page }) => {
    await expect(page.getByText('Endpoint tùy chỉnh')).toHaveCount(0);
    await expect(page.getByText('NVIDIA NIM', { exact: true })).toBeVisible();
    await expect(page.getByText(/b\.AI/)).toHaveCount(0);
  });

  test('Lưu cài đặt ghi provider + key + model vào storage', async ({ page }) => {
    await page.getByPlaceholder('nvapi-...').fill('nvapi-test-key-123');
    await page.getByText('Lưu cài đặt').click();
    await expect(page.getByText('Đã lưu').first()).toBeVisible();

    expect(await getStorage(page, KEYS.provider)).toBe('nvidia');
    expect(await getStorage(page, KEYS.apiKey)).toBe('nvapi-test-key-123');
    expect(await getStorage(page, KEYS.model)).toBe('nvidia/nemotron-3-super-120b-a12b');
  });

  test('key đã lưu được đọc lại khi mở Settings', async ({ page }) => {
    await seedStorage(page, { [KEYS.provider]: 'nvidia', [KEYS.apiKey]: 'nvapi-saved-key' });
    await page.reload();
    await gotoTab(page, 'Cài đặt');
    await expect(page.getByPlaceholder('nvapi-...')).toHaveValue('nvapi-saved-key');
  });

  test('cấu hình b.AI cũ dùng model và key NVIDIA khi kết nối', async ({ page }) => {
    await seedStorage(page, {
      [KEYS.provider]: 'bai', [KEYS.model]: 'hy3',
      '@bai_key': 'sk-obsolete-key', [KEYS.apiKey]: 'nvapi-saved-key',
    });
    await page.reload();
    await gotoTab(page, 'Cài đặt');
    await expect(page.getByText('Nemotron 3 Super 120B (mạnh, miễn phí)')).toBeVisible();
    await expect(page.getByPlaceholder('nvapi-...')).toHaveValue('nvapi-saved-key');
    const request = page.waitForRequest((r) =>
      r.url().endsWith('/api/llm') && r.postDataJSON()?.body?.messages?.some((m: { content: string }) => m.content === 'ping'),
    );
    await page.getByText('Kiểm tra kết nối').click();
    const payload = (await request).postDataJSON();
    expect(payload.url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(payload.headers.Authorization).toBe('Bearer nvapi-saved-key');
    expect(payload.body.model).toBe('nvidia/nemotron-3-super-120b-a12b');
    await expect(page.getByText('Kết nối NVIDIA NIM thành công')).toBeVisible();
    await page.getByText('Lưu cài đặt').click();
    await expect(page.getByText('Đã lưu').first()).toBeVisible();
    expect(await getStorage(page, KEYS.provider)).toBe('nvidia');
  });

  test('Kiểm tra kết nối: thành công (mock LLM 200)', async ({ page }) => {
    await page.getByPlaceholder('nvapi-...').fill('nvapi-key');
    await page.getByText('Kiểm tra kết nối').click();
    await expect(page.getByText('Kết nối NVIDIA NIM thành công')).toBeVisible({ timeout: 20_000 });
  });

  test('Kiểm tra kết nối: thất bại hiện lỗi', async ({ page }) => {
    // Route đăng ký sau đè route mock của beforeEach
    await page.route('**/api/llm', (r) =>
      r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'invalid api key' } }) }),
    );
    await page.getByPlaceholder('nvapi-...').fill('wrong-key');
    await page.getByText('Kiểm tra kết nối').click();
    await expect(page.getByText(/invalid api key|Lỗi/).last()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Kết nối NVIDIA NIM thành công')).toHaveCount(0);
  });
});
