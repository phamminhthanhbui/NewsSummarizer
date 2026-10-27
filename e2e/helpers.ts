// Feed, article and media fixtures. Summary content is selected locally.
// Storage uses the real browser persistence mechanism.

import { expect, type Page } from '@playwright/test';

// ---- Storage keys (phải khớp src/services/storage.ts) ----
export const KEYS = {
  saved: '@saved_articles',
  history: '@summary_history',
  feedsCache: '@feeds_cache',
  feedsCacheTime: '@feeds_cache_time',
  pitch: '@voice_pitch',
  rate: '@voice_rate',
  themeMode: '@theme_mode',
  notifEnabled: '@notif_enabled',
  notifTimes: '@notif_times',
  readCounts: '@read_counts',
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
  // Video — nuôi dải VIDEO. Thêm vào CUỐI để chỉ số FEED_ITEMS[0..5] mà các test
  // khác đang dùng không xê dịch.
  {
    title: 'Toàn cảnh vụ cháy lớn ở trung tâm thành phố',
    link: 'https://video.vnexpress.net/tin-tuc/toan-canh-vu-chay-1001.html',
    description: 'Hiện trường vụ cháy nhìn từ trên cao.',
    pubDate: new Date().toISOString(),
    image: 'https://placehold.co/600x400/1D4ED8/FFFFFF?text=Video+1',
    source: 'VNExpress',
    category: 'Video',
  },
  {
    title: 'Khoảnh khắc bàn thắng phút bù giờ',
    link: 'https://video.vnexpress.net/the-thao/khoanh-khac-ban-thang-1002.html',
    description: 'Pha lập công ở phút thứ 94.',
    pubDate: new Date().toISOString(),
    image: 'https://placehold.co/600x400/0891B2/FFFFFF?text=Video+2',
    source: 'VNExpress',
    category: 'Video',
  },
  {
    title: 'Hướng dẫn sơ cứu khi bị bỏng',
    link: 'https://video.vnexpress.net/suc-khoe/huong-dan-so-cuu-1003.html',
    description: 'Các bước sơ cứu đúng cách tại nhà.',
    pubDate: new Date().toISOString(),
    image: 'https://placehold.co/600x400/16A34A/FFFFFF?text=Video+3',
    source: 'VNExpress',
    category: 'Video',
  },
];

export const VIDEO_ITEMS = FEED_ITEMS.filter((i) => i.category === 'Video');

export const JINA_MARKDOWN = `Title: Bài báo mẫu
URL Source: https://example.com/bai-1
Markdown Content:
Đoạn mở đầu của bài báo mẫu dùng cho test E2E. Nội dung đủ dài để vượt ngưỡng tối thiểu hai trăm ký tự mà hàm fetchArticleContent yêu cầu, nhờ đó khối nội dung được parse thành công.

## Tiểu mục

- Ý chính thứ nhất: số liệu tăng trưởng đạt 12 phần trăm trong quý vừa qua.
- Ý chính thứ hai: chuyên gia nhận định xu hướng sẽ tiếp diễn đến cuối năm.

Đoạn kết luận tóm tắt lại ý nghĩa của sự kiện và triển vọng trong thời gian tới cho người đọc.`;

export const SUMMARY_TEXT = 'Đoạn mở đầu của bài báo mẫu dùng cho test E2E.';

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

  // Supabase Auth: mock lỗi đăng nhập để test form + thông báo tiếng Việt mà không
  // tạo tài khoản thật hoặc phụ thuộc mạng ngoài trong E2E.
  await page.route('**/auth/v1/token**', (route) => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
  }));

  // Firebase Auth (provider mặc định): cùng mục đích — trả lỗi đăng nhập đã được
  // SDK ánh xạ thành auth/invalid-credential, không gọi mạng thật.
  await page.route('**/v1/accounts:signInWithPassword**', (route) => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({
      error: { code: 400, message: 'INVALID_LOGIN_CREDENTIALS', errors: [{ message: 'INVALID_LOGIN_CREDENTIALS', domain: 'global', reason: 'invalid' }] },
    }),
  }));
  await page.route('**/v1/accounts:sendOobCode**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ email: 'test@example.com' }),
  }));

  // RSS qua proxy: /api/fetch?url=... — app gán source/category theo feed được yêu
  // cầu, nên mock phải trả item khác nhau theo category của feed (URL RSS chứa
  // keyword). Nếu không, dedup theo link sẽ dồn mọi item về feed đầu tiên.
  // feedSeq: số thứ tự ổn định cho mỗi URL feed (lần đầu thấy = size mới).
  const feedSeq = new Map<string, number>();
  await page.route('**/api/fetch?url=**', async (route) => {
    const reqUrl = decodeURIComponent(route.request().url());
    const target = new URL(route.request().url()).searchParams.get('url') || '';
    if (/^https:\/\/example\.com\/bai-/.test(target)) {
      const body = '<html><body><div class="article-body"><p>Đoạn mở đầu của bài báo mẫu dùng cho test E2E. Nội dung đủ dài để vượt ngưỡng tối thiểu hai trăm ký tự mà hàm fetchArticleContent yêu cầu, nhờ đó khối nội dung được parse thành công.</p><p>Số liệu tăng trưởng đạt 12 phần trăm trong quý vừa qua theo báo cáo của cơ quan chức năng.</p><p>Chuyên gia cho biết số liệu còn cần được kiểm chứng trước khi công bố kết luận chính thức.</p></div></body></html>';
      await route.fulfill({status: 200, contentType: 'text/html', body});
      return;
    }

    // Keyword trong URL RSS → category của feed
    let cat: string = 'Việt Nam';
    if (/so-hoa|cong-nghe|genk/i.test(reqUrl)) cat = 'Công nghệ';
    else if (/kinh-doanh|kinh-te|cafebiz/i.test(reqUrl)) cat = 'Kinh doanh';
    else if (/the-thao|bongda/i.test(reqUrl)) cat = 'Thể thao';
    else if (/giai-tri|kenh14/i.test(reqUrl)) cat = 'Giải trí';
    else if (/suc-khoe|hellobacsi|suckhoedoisong/i.test(reqUrl)) cat = 'Sức khỏe';
    // Đặt SAU cùng: URL feed video là video.vnexpress.net/rss/tin-moi-nhat.rss,
    // không đụng các nhánh trên, nhưng để cuối cho chắc.
    else if (/video/i.test(reqUrl)) cat = 'Video';

    // Feed "nổi bật" (noi-bat): trả bài featured để hero/ticker nhận item0
    let items = /noi-bat/i.test(reqUrl)
      ? FEED_ITEMS.filter((i) => i.featured)
      : FEED_ITEMS.filter((i) => i.category === cat);
    if (!items.length) items = FEED_ITEMS.filter((i) => i.category === 'Việt Nam');
    if (!items.length) items = [FEED_ITEMS[0]];

    // MỖI FEED NHẬN MỘT ITEM RIÊNG: trước đây mọi feed cùng category trả cùng
    // item (cùng link) → finalize() dedup theo link dồn về feed đầu, dropdown
    // nguồn (build từ item thật) thiếu báo; đổi link thôi thì title vẫn trùng
    // nhiều bản → getByText strict-mode fail. Cấp mỗi feed URL một số thứ tự
    // tăng dần (theo page) → xoay vòng item trong list category: mỗi feed một
    // item riêng link+title, thứ tự ổn định giữa các request của cùng feed.
    // Featured (noi-bat) giữ nguyên: hero/ticker test lấy đúng title item0.
    const rssUrl = reqUrl.split('url=')[1] || '';
    const feedNo = feedSeq.get(rssUrl) ?? feedSeq.size;
    feedSeq.set(rssUrl, feedNo);
    const pick = items[feedNo % items.length];
    // Feed Video trả HẾT item như feed nổi bật — có vậy dải VIDEO mới có nhiều
    // thẻ để test. Các feed khác vẫn 1 item/feed (xem comment MỖI FEED NHẬN MỘT
    // ITEM RIÊNG ở trên).
    const perFeed =
      /noi-bat/i.test(reqUrl) || cat === 'Video'
        ? items
        : [{ ...pick, link: `${pick.link}?f=${feedNo}` }];
    const xml = `<?xml version="1.0"?><rss><channel>${perFeed.map((i) => `
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

  // Nội dung bài viết: /api/jina?url=...
  await page.route('**/api/jina**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/markdown', body: JINA_MARKDOWN }),
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
  const tab = label === 'Trang chủ' ? 'Hôm nay' : (label === 'Đã lưu' || label === 'Lịch sử') ? 'Thư viện' : label;
  await page.getByRole('tablist').getByText(tab, { exact: true }).first().click();
  if (label === 'Lịch sử') await page.getByTestId('savedScreen').getByText('Lịch sử', { exact: true }).click();
  if (label === 'Đã lưu' && await page.getByTestId('historyScreen').isVisible()) await page.getByTestId('historyScreen').getByText('Bài đã lưu', { exact: true }).click();
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
// Cuộn list cho tới khi thấy text rồi trả về locator.
// FlatList ảo hoá: row ngoài viewport KHÔNG có trong DOM, nên getByText(...).click()
// thẳng sẽ timeout dù bài có trong dữ liệu — chỉ phụ thuộc chiều cao dòng/độ dài feed.
export async function scrollToText(page: Page, text: string, maxTries = 12) {
  const loc = page.getByText(text).first();
  for (let i = 0; i < maxTries; i++) {
    if (await loc.isVisible().catch(() => false)) return loc;
    await page.mouse.move(400, 500);
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(250);
  }
  await expect(loc).toBeVisible(); // hết lượt → để Playwright báo lỗi rõ ràng
  return loc;
}

// Chờ app load xong: skeleton biến mất, có bài hoặc empty state.
// App CHỈ fetch khi user bấm Làm mới (mount chỉ đọc cache) → helper bấm luôn
// để có dữ liệu, rồi chờ dấu hiệu thật: một trendCard hoặc empty state.
// refresh:false cho test mà ĐỐI TƯỢNG là "reload không được gọi mạng" — bấm Làm
// mới ở đó sẽ tự tay tạo ra request mà test đang kiểm là không có.
export async function waitForFeedLoaded(page: Page, opts: { refresh?: boolean } = {}) {
  await expect(page.getByLabel('Đang tải')).toBeHidden({ timeout: 30_000 });
  if (opts.refresh === false) return; // caller tự chờ nội dung cache của nó
  await page.getByLabel('Làm mới').click();
  await expect(
    page.getByTestId('feedCard').first().or(page.getByLabel('Không có bài báo')),
  ).toBeVisible({ timeout: 30_000 });
}
