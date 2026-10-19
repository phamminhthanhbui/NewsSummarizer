// Dải thời tiết — phải cấp quyền vị trí TRƯỚC khi trang load nên không dùng
// beforeEach chung của home.spec.ts.
import { test, expect, type Page } from '@playwright/test';
import { mockNetwork, waitForFeedLoaded } from './helpers';

// Shape lấy từ lần gọi THẬT api.open-meteo.com (xem services/weather.ts).
const OPEN_METEO = {
  current: { temperature_2m: 31.9, weather_code: 95 },
  daily: {
    time: ['2026-10-03', '2026-10-04', '2026-10-05'],
    weather_code: [95, 96, 0],
    temperature_2m_max: [31.9, 30.0, 25.7],
    temperature_2m_min: [26.9, 23.9, 21.7],
  },
};

// Shape lấy từ lần gọi THẬT api.bigdatacloud.net (xem services/weather.ts).
// `locality` = cấp phường, `city` = cấp thành phố → nhãn ghép "Phường, Thành phố".
const BIGDATACLOUD = { city: 'Hà Nội', locality: 'Hoàn Kiếm' };

async function setup(page: Page, granted: boolean) {
  await mockNetwork(page);
  // Đăng ký SAU mockNetwork: Playwright xét route theo thứ tự NGƯỢC, nên route
  // này thắng catch-all — catch-all abort mọi host ngoài localhost.
  await page.route('**api.open-meteo.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(OPEN_METEO),
    }),
  );
  await page.route('**api.bigdatacloud.net/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(BIGDATACLOUD),
    }),
  );
  if (granted) {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 21.0285, longitude: 105.8542 });
  }
  await page.goto('/');
  await waitForFeedLoaded(page);
}

test.describe('Dải thời tiết', () => {
  test('có quyền vị trí: hiện nhiệt độ hiện tại + dự báo 2 ngày', async ({ page }) => {
    await setup(page, true);

    await expect(page.getByText('32°')).toBeVisible(); // round(31.9)
    // Nhãn ghép từ locality + city của BigDataCloud, không phải nhãn chung
    await expect(page.getByText('Hoàn Kiếm, Hà Nội')).toBeVisible();
    // 3 ngày trả về, ngày ĐẦU bị bỏ vì nhiệt độ hiện tại đã ở bên trái → còn 2.
    // 2026-10-04 = CN, 2026-10-05 = T2 (đã khoá bằng weatherCode.test.ts).
    await expect(page.getByText('CN')).toBeVisible();
    await expect(page.getByText('T2')).toBeVisible();
    await expect(page.getByText('30°')).toBeVisible(); // max ngày 04
    await expect(page.getByText('26°')).toBeVisible(); // round(25.7) ngày 05
  });

  test('từ chối quyền: ẩn hẳn dải, Trang chủ vẫn chạy bình thường', async ({ page }) => {
    await setup(page, false);

    await expect(page.getByText('Giá vàng trong nước lập đỉnh mới').first()).toBeVisible();
    await expect(page.getByText('Hoàn Kiếm, Hà Nội')).toHaveCount(0);
    await expect(page.getByText('32°')).toHaveCount(0);
  });
});
