// Helpers + mock network cho E2E.
//
// App web gọi mạng qua proxy localhost:3001 (feeds, videos, jina, llm)
// và provider AI (openrouter/google đi thẳng). Route TẤT CẢ về mock để test
// không phụ thuộc mạng thật — muốn test mạng thật thì bỏ comment các dòng
// route() tương ứng.
//
// LƯU Ý: KHÔNG mock AsyncStorage — app tự persist qua localStorage, test đọc
// localStorage để kiểm chứng (đó mới là hành vi thật).

import { expect, type Page } from '@playwright/test';

export const SECRET_CODE = '016527';

// ---- Storage keys (phải khớp src/services/storage.ts) ----
export const KEYS = {
  provider: '@llm_provider',
  baiKey: '@bai_key',
  apiKey: '@nim_key',
  openaiKey: '@openai_key',
  anthropicKey: '@anthropic_key',
  googleKey: '@google_key',
  openrouterKey: '@openrouter_key',
  customKey: '@custom_key',
  customBaseUrl: '@custom_base_url',
  model: '@nim_model',
  saved: '@saved_articles',
  history: '@summary_history',
  feedsCache: '@feeds_cache',
  pitch: '@voice_pitch',
  rate: '@voice_rate',
  aiUnlocked: '@ai_unlocked',
  themeMode: '@theme_mode',
  notifEnabled: '@notif_enabled',
  notifTimes: '@notif_times',
} as const;

// ---- Dữ liệu giả ----
export const FEED_ITEMS = [
  {
    title: 'Giá vàng trong nước lập đỉnh mới',
    link: 'https://example.com/bai-1',
    description: 'Giá vàng SJC tăng mạnh lên mức cao nhất từ trước đến nay trong phiên giao dịch sáng nay.',
    pubDate: new Date().toISOString(),
    image: 'https://placehold.co/600x400/FB512A/FFFFFF?text=Bai+1',
    source: 'VNExpress',
    category: 'Kinh doanh',
    featured: true,
  },
  {
    title: 'Đội tuyển Việt Nam thắng đậm trận giao hữu',
    link: 'https://example.com/bai-2',
    description: 'Các cầu thủ Việt Nam ghi ba bàn trong hiệp hai để giành chiến thắng thuyết phục.',
    pubDate: new Date().toISOString(),
    image: 'https://placehold.co/600x400/059669/FFFFFF?text=Bai+2',
    source: 'Dân Trí',
    category: 'Thể thao',
  },
  {
    title: 'Trí tuệ nhân tạo thay đổi ngành giáo dục',
    link: 'https://example.com/bai-3',
    description: 'Nhiều trường đại học ứng dụng AI vào giảng dạy và chấm điểm tự động.',
    pubDate: new Date().toISOString(),
    image: 'https://placehold.co/600x400/7C3AED/FFFFFF?text=Bai+3',
    source: 'VNExpress',
    category: 'Công nghệ',
  },
  {
    title: 'Ca sĩ trẻ ra mắt album đầu tay',
    link: 'https://example.com/bai-4',
    description: 'Album gồm mười ca khúc pop ballad do chính ca sĩ sáng tác.',
    pubDate: new Date().toISOString(),
    image: 'https://placehold.co/600x400/DB2777/FFFFFF?text=Bai+4',
    source: 'Kenh14',
    category: 'Giải trí',
  },
  {
    title: 'Bác sĩ khuyến cáo phòng bệnh mùa nắng nóng',
    link: 'https://example.com/bai-5',
    description: 'Thời tiết nắng nóng kéo dài làm gia tăng các bệnh về tim mạch và hô hấp.',
    pubDate: new Date().toISOString(),
    image: 'https://placehold.co/600x400/2563EB/FFFFFF?text=Bai+5',
    source: 'Tuổi Trẻ',
    category: 'Sức khỏe',
  },
  {
    title: 'Quốc hội thảo luận dự luật ngân sách',
    link: 'https://example.com/bai-6',
    description: 'Các đại biểu tập trung thảo luận về phân bổ ngân sách cho giáo dục và y tế.',
    pubDate: new Date().toISOString(),
    image: 'https://placehold.co/600x400/DC2626/FFFFFF?text=Bai+6',
    source: 'VietNamNet',
    category: 'Việt Nam',
  },
];

export const VIDEO_ITEMS = [
  {
    title: 'Video hiện trường vụ cháy chung cư',
    link: 'https://example.com/video-1',
    thumb: 'https://placehold.co/320x180/111111/FFFFFF?text=Video+1',
    duration: '02:15',
    pubDate: new Date().toISOString(),
    zone: 'Video nổi bật',
    source: 'VNExpress',
    stream: 'https://example.com/stream/video-1/master.m3u8',
  },
  {
    title: 'Phỏng vấn huấn luyện viên sau trận đấu',
    link: 'https://example.com/video-2',
    thumb: 'https://placehold.co/320x180/222222/FFFFFF?text=Video+2',
    duration: '05:40',
    pubDate: new Date().toISOString(),
    zone: 'Video',
    source: 'Kenh14',
    // không có stream → popup hiện thumb + nút mở tại nguồn
  },
];

export const JINA_MARKDOWN = `Title: Bài báo mẫu
URL Source: https://example.com/bai-1
Markdown Content:
Đoạn mở đầu của bài báo mẫu dùng cho test E2E. Nội dung đủ dài để vượt ngưỡng tối thiểu hai trăm ký tự mà hàm fetchArticleContent yêu cầu, nhờ đó khối nội dung được parse thành công.

## Tiểu mục

- Ý chính thứ nhất: số liệu tăng trưởng đạt 12 phần trăm trong quý vừa qua.
- Ý chính thứ hai: chuyên gia nhận định xu hướng sẽ tiếp diễn đến cuối năm.

Đoạn kết luận tóm tắt lại ý nghĩa của sự kiện và triển vọng trong thời gian tới cho người đọc.`;

export const SUMMARY_TEXT = 'Tóm tắt AI giả lập: giá vàng tăng mạnh do nhu cầu trú ẩn an toàn.';

// ---- Mock network ----
export async function mockNetwork(page: Page) {
  // Cờ E2E: tắt auto-play (marquee NÓNG, carousel hero) để click không bị timeout
  await page.addInitScript(() => {
    (window as any).__E2E__ = true;
  });

  // Catch-all phải đăng ký ĐẦU TIÊN: Playwright xét route theo thứ tự NGƯỢC
  // (đăng ký sau kiểm tra trước), nên các route cụ thể phía dưới sẽ thắng.
  // Chặn mọi URL http ngoài localhost + placehold.co để test khỏi chậm.
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http') && !/localhost|127\.0\.0\.1|placehold\.co|data:/.test(url)) {
      return route.abort();
    }
    return route.continue();
  });

  // RSS qua proxy: /api/fetch?url=... — app gán source/category theo feed được yêu
  // cầu, nên mock phải trả item khác nhau theo category của feed (URL RSS chứa
  // keyword). Nếu không, dedup theo link sẽ dồn mọi item về feed đầu tiên.
  await page.route('**/api/fetch?url=**', async (route) => {
    const reqUrl = decodeURIComponent(route.request().url());
    // Keyword trong URL RSS → category của feed
    let cat: string = 'Việt Nam';
    if (/so-hoa|cong-nghe|genk/i.test(reqUrl)) cat = 'Công nghệ';
    else if (/kinh-doanh|kinh-te|cafebiz/i.test(reqUrl)) cat = 'Kinh doanh';
    else if (/the-thao|bongda/i.test(reqUrl)) cat = 'Thể thao';
    else if (/giai-tri|kenh14/i.test(reqUrl)) cat = 'Giải trí';
    else if (/suc-khoe|hellobacsi|suckhoedoisong/i.test(reqUrl)) cat = 'Sức khỏe';

    // Feed "nổi bật" (noi-bat): trả bài featured để hero/ticker nhận item0
    let items = /noi-bat/i.test(reqUrl)
      ? FEED_ITEMS.filter((i) => i.featured)
      : FEED_ITEMS.filter((i) => i.category === cat);
    if (!items.length) items = FEED_ITEMS.filter((i) => i.category === 'Việt Nam');
    if (!items.length) items = [FEED_ITEMS[0]];

    const xml = `<?xml version="1.0"?><rss><channel>${items.map((i) => `
      <item>
        <title><![CDATA[${i.title}]]></title>
        <link>${i.link}</link>
        <pubDate>${i.pubDate}</pubDate>
        <description><![CDATA[${i.description}]]></description>
        <enclosure url="${i.image}" type="image/jpeg"/>
      </item>`).join('')}
    </channel></rss>`;
    await route.fulfill({ status: 200, contentType: 'application/rss+xml', body: xml });
  });

  // Video crawl: /api/videos
  await page.route('**/api/videos', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: VIDEO_ITEMS }) }),
  );

  // Nội dung bài viết: /api/jina?url=...
  await page.route('**/api/jina**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/markdown', body: JINA_MARKDOWN }),
  );

  // LLM qua proxy (nvidia/openai/anthropic/custom): POST /api/llm
  await page.route('**/api/llm', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: SUMMARY_TEXT } }] }),
    }),
  );

  // Provider đi thẳng (openrouter/google có CORS native)
  await page.route('**/openrouter.ai/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: SUMMARY_TEXT } }] }),
    }),
  );
  await page.route('**/generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: SUMMARY_TEXT } }] }),
    }),
  );

  // HLS segment (nếu video stream được phát) — chặn nhẹ, tránh treo
  await page.route('**/*.m3u8', (route) => route.fulfill({ status: 200, contentType: 'application/vnd.apple.mpegurl', body: '#EXTM3U\n#EXT-X-ENDLIST\n' }));
}

// ---- Seed / đọc localStorage ----
export async function seedStorage(page: Page, entries: Record<string, string>) {
  await page.addInitScript((data) => {
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
  }, entries);
}

export async function getStorage(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

export async function clearAppStorage(page: Page) {
  await page.evaluate(() => localStorage.clear());
}

// ---- Điều hướng tab (label tiếng Việt của bottom tab) ----
// Dùng text trong tablist thay vì role=button: trên màn stack (Article) các nút
// tab mất role button nên getByRole('button') không khớp.
export async function gotoTab(page: Page, label: 'Trang chủ' | 'Lịch sử' | 'Đã lưu' | 'Cài đặt') {
  await page.getByRole('tablist').getByText(label).first().click();
}

// ---- Mở modal tìm kiếm + nhập mã/từ khóa ----
export async function openSearch(page: Page) {
  await page.getByLabel('Tìm kiếm').click();
  await expect(page.getByPlaceholder('Tìm tiêu đề, nội dung...')).toBeVisible();
}

export async function typeSearch(page: Page, text: string) {
  await page.getByPlaceholder('Tìm tiêu đề, nội dung...').fill(text);
}

// Nhập mã bí mật: fill rồi chờ custom alert (Modal), bấm OK, trả về message.
export async function enterSecretCode(page: Page, code: string = SECRET_CODE) {
  await typeSearch(page, code);
  // Custom alert hiện message
  const unlock = page.getByText('Đã mở khóa cấu hình AI trong Cài đặt');
  const hide = page.getByText('Đã ẩn cấu hình AI trong Cài đặt');
  await expect(unlock.or(hide)).toBeVisible({ timeout: 5000 });
  const msg = (await unlock.isVisible()) ? 'Đã mở khóa cấu hình AI trong Cài đặt' : 'Đã ẩn cấu hình AI trong Cài đặt';
  // Bấm OK để đóng alert
  await page.getByText('OK', { exact: true }).click();
  await expect(unlock.or(hide)).toBeHidden();
  return msg;
}

// Chờ app load xong: skeleton biến mất, có bài hoặc empty state
export async function waitForFeedLoaded(page: Page) {
  await expect(page.getByLabel('Đang tải')).toBeHidden({ timeout: 30_000 });
}
