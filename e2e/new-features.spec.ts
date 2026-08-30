// E2E: tính năng mới — dropdown nguồn tin, ticker NÓNG, card gọn TIN MỚI NHẤT,
// mục Thông báo (nhiều khung giờ + giờ tùy chỉnh), alert dùng chung, scroll-về-đầu.
import { test, expect } from '@playwright/test';
import {
  KEYS, mockNetwork, seedStorage, getStorage, gotoTab, waitForFeedLoaded,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
  await page.goto('/');
  await waitForFeedLoaded(page);
});

test.describe('Dropdown nguồn tin (logo + lọc)', () => {
  test('chọn category reset nguồn về "Tất cả"', async ({ page }) => {
    await page.getByLabel('Lọc theo nguồn tin').click();
    await page.getByTestId('sourceOption-Dân Trí').click({ force: true });
    // đang lọc Dân Trí → empty, nhưng category Công nghệ reset source về Tất cả
    await page.getByRole('button', { name: 'Công nghệ' }).click();
    await expect(page.getByText('Trí tuệ nhân tạo thay đổi ngành giáo dục')).toBeVisible();
  });
});

test.describe('Ticker NÓNG', () => {
  test('badge NÓNG + tiêu đề bài nổi bật xuất hiện', async ({ page }) => {
    await expect(page.getByText('NÓNG', { exact: true })).toBeVisible();
    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới').first()).toBeVisible();
  });

  test('bấm tin trên ticker mở màn hình bài báo', async ({ page }) => {
    await page.getByText('Giá vàng trong nước lập đỉnh mới').first().click();
    await expect(page.getByText('AI TÓM TẮT')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Card gọn TIN MỚI NHẤT', () => {
  test('bài không nổi bật hiện dạng card gọn trong danh sách', async ({ page }) => {
    await expect(page.getByText('Đội tuyển Việt Nam thắng đậm trận giao hữu')).toBeVisible();
    await expect(page.getByText('Ca sĩ trẻ ra mắt album đầu tay')).toBeVisible();
  });

  test('bấm card gọn mở bài', async ({ page }) => {
    await page.getByText('Quốc hội thảo luận dự luật ngân sách').click();
    await expect(page.getByText('AI TÓM TẮT')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Mục Thông báo trong Settings', () => {
  test('mục hiện; trên web switch bị vô hiệu + ghi chú không hỗ trợ', async ({ page }) => {
    await gotoTab(page, 'Cài đặt');
    await expect(page.getByText('Thông báo', { exact: true })).toBeVisible();
    await expect(page.getByText('Bản tin hằng ngày')).toBeVisible();
    await expect(page.getByTestId('notif-switch')).toBeDisabled();
    await expect(page.getByText('Thông báo không hỗ trợ trên web và trong Expo Go — dùng bản APK cài trực tiếp để bật.')).toBeVisible();
  });

  test('đã bật từ trước: hiện chips nhiều khung giờ, giờ đã chọn được tô', async ({ page }) => {
    await seedStorage(page, {
      [KEYS.notifEnabled]: '1',
      [KEYS.notifTimes]: JSON.stringify(['06:00', '18:00']),
    });
    await page.goto('/');
    await gotoTab(page, 'Cài đặt');
    await expect(page.getByText('Giờ gửi (chọn nhiều khung giờ)')).toBeVisible();
    await expect(page.getByText('06:00', { exact: true })).toBeVisible();
    await expect(page.getByText('18:00', { exact: true })).toBeVisible();
  });

  test('thêm giờ tùy chỉnh hợp lệ: ghi vào storage', async ({ page }) => {
    await seedStorage(page, {
      [KEYS.notifEnabled]: '1',
      [KEYS.notifTimes]: JSON.stringify(['06:00']),
    });
    await page.goto('/');
    await gotoTab(page, 'Cài đặt');
    await page.getByPlaceholder('HH:MM').fill('09:15');
    await page.getByText('Thêm', { exact: true }).click();
    const times = JSON.parse((await getStorage(page, KEYS.notifTimes)) || '[]');
    expect(times).toContain('09:15');
  });

  test('giờ tùy chỉnh không hợp lệ: alert cảnh báo, không ghi', async ({ page }) => {
    await seedStorage(page, {
      [KEYS.notifEnabled]: '1',
      [KEYS.notifTimes]: JSON.stringify(['06:00']),
    });
    await page.goto('/');
    await gotoTab(page, 'Cài đặt');
    await page.getByPlaceholder('HH:MM').fill('25:99');
    await page.getByText('Thêm', { exact: true }).click();

    // Custom alert (Modal) hiện title cảnh báo
    await expect(page.getByText('Giờ không hợp lệ')).toBeVisible();
    const times = JSON.parse((await getStorage(page, KEYS.notifTimes)) || '[]');
    expect(times).not.toContain('25:99');
    await page.getByText('OK', { exact: true }).click();
    await expect(page.getByText('Giờ không hợp lệ')).toBeHidden();
  });
});

test.describe('Alert dùng chung', () => {
  test('alert hiện message + nút OK, đóng được', async ({ page }) => {
    // Kích hoạt alert qua mã bí mật (custom alert thay cho dialog hệ thống)
    await page.getByLabel('Tìm kiếm').click();
    await page.getByPlaceholder('Tìm tiêu đề, nội dung...').fill('016527');
    await expect(page.getByText('Đã mở khóa cấu hình AI trong Cài đặt')).toBeVisible({ timeout: 5000 });
    await page.getByText('OK', { exact: true }).click();
    await expect(page.getByText('Đã mở khóa cấu hình AI trong Cài đặt')).toBeHidden();
  });
});

test.describe('Scroll về đầu khi bấm lại tab Trang chủ', () => {
  test('đang cuộn xuống, bấm lại tab Home → cuộn về đầu', async ({ page }) => {
    const verticalScrolled = () => page.evaluate(() => {
      const se = document.scrollingElement;
      if (se && se.scrollTop > 0) return true;
      return Array.from(document.querySelectorAll('div'))
        .some((el) => el.scrollTop > 0 && el.scrollHeight > el.clientHeight);
    });

    // Cuộn xuống trong danh sách
    await page.mouse.move(400, 500);
    await page.mouse.wheel(0, 2500);
    await page.waitForTimeout(600);
    expect(await verticalScrolled()).toBe(true);

    // Bấm lại tab Trang chủ khi đang ở tab này
    await gotoTab(page, 'Trang chủ');
    await page.waitForTimeout(600);
    expect(await verticalScrolled()).toBe(false);
  });
});