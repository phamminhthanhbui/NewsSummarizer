// E2E: pipeline ảnh/caption trong tóm tắt — các case phát sinh từ review thực tế.
// ArticleScreen hiển thị các câu được chọn tại thiết bị, ảnh/chú thích và bài
// liên quan. Kiểm tra nội dung từ nguồn và media sau khi lọc widget của báo.
import { test, expect, type Page } from '@playwright/test';
import {
  FEED_ITEMS, JINA_MARKDOWN, KEYS, mockNetwork, seedStorage, waitForFeedLoaded,
} from './helpers';

const FIRST = FEED_ITEMS[0];
const SECOND = FEED_ITEMS[1];

async function openFirstArticle(page: Page) {
  await page.getByText(FIRST.title).first().click();
  await expect(page.getByText('TÓM TẮT', { exact: true })).toBeVisible({ timeout: 15_000 });
}

// Override route Jina đăng ký SAU mockNetwork → thắng route mặc định
const SOURCE_CONTEXT = 'Ban tổ chức cho biết thông tin được ghi nhận tại sự kiện và sẽ tiếp tục được cập nhật theo diễn biến thực tế. Các đơn vị liên quan đang kiểm tra những nội dung cần làm rõ trước khi công bố thông báo chính thức. Người đọc có thể theo dõi bài gốc để xem đầy đủ hình ảnh và các phát biểu tại sự kiện.';

function mockJina(page: Page, md: string) {
  return page.route('**/api/jina**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/markdown', body: md + '\n\n' + SOURCE_CONTEXT }),
  );
}

const P = (text: string, bg: string, fg?: string) => `https://placehold.co/600x400/${bg}/${fg || 'FFFFFF'}.jpg?text=${text}`;

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
  await seedStorage(page, { [KEYS.feedsCache]: JSON.stringify(FEED_ITEMS), [KEYS.feedsCacheTime]: String(Date.now()), [KEYS.history]: '[]' });
  await page.route('https://placehold.co/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#dbe2e8"/></svg>' }));
  await page.route('**/api/fetch?url=**', route => {
    const target = new URL(route.request().url()).searchParams.get('url') || '';
    return /^https:\/\/example\.com\/bai-/.test(target) ? route.fulfill({ status: 503, body: '' }) : route.fallback();
  });
  await page.goto('/');
  await waitForFeedLoaded(page);
});

test.describe('Lọc ảnh/text không liên quan (widget AI TÓM TẮT của báo)', () => {
  test('widget có đủ marker: ảnh widget bị loại, hero + tóm tắt vẫn hiện', async ({ page }) => {
    await mockJina(page, `![Hero](https://placehold.co/600x400/EEEEEE/333333.jpg?text=HeroTP)

AI TÓM TẮT

Nghe

![Image 5: related](https://placehold.co/600x400/999999/FFFFFF.jpg?text=WidgetThumb)

[Dàn cầu thủ tuyển Việt Nam hôn vợ, khoe cúp gây bão mạng](https://example.com/dan-cau-thu-post1871557.tpo)

## [Phương Mỹ Chi sau đám cưới hơn 14 triệu lượt xem](https://example.com/phuong-my-post1871201.tpo)

Copy tóm tắt

Tiền Phong

28/8/2026

Đoạn thân bài thật của bài báo đủ dài để app parse và hiển thị tóm tắt.`);
    await openFirstArticle(page);
    await expect(page.locator('img[src*="WidgetThumb"]')).toHaveCount(0);
    await expect(page.locator('img[src*="HeroTP"]').first()).toBeVisible();
    await expect(page.getByTestId('summary-method')).toContainText('Chọn câu từ bài gốc');
  });

  test('không có marker kết thúc: fallback vẫn loại ảnh widget, giữ hero', async ({ page }) => {
    await mockJina(page, `![Hero](https://placehold.co/600x400/EEEEEE/333333.jpg?text=HeroTP)

AI TÓM TẮT

![Image 5: related](https://placehold.co/600x400/999999/FFFFFF.jpg?text=WidgetThumb)

[Dàn cầu thủ tuyển Việt Nam hôn vợ, khoe cúp gây bão mạng](https://example.com/dan-cau-thu-post1871557.tpo)

# Tiêu đề thật của bài báo

Thân bài thật sau tiêu đề. Đoạn này đủ dài để app parse và hiển thị tóm tắt.`);
    await openFirstArticle(page);
    await expect(page.locator('img[src*="WidgetThumb"]')).toHaveCount(0);
    await expect(page.locator('img[src*="HeroTP"]').first()).toBeVisible();
    await expect(page.getByTestId('summary-method')).toContainText('Chọn câu từ bài gốc');
  });

  test('ảnh bọc link: zoom về chính ảnh được giữ, link bài khác bị bỏ', async ({ page }) => {
    await mockJina(page, `[![Image 1: a](https://placehold.co/600x400/AAAAAA/FFFFFF.jpg?text=SelfZoom)](https://placehold.co/600x400/AAAAAA/FFFFFF.jpg?text=SelfZoom)

[![Image 2: b](https://placehold.co/600x400/BBBBBB/FFFFFF.jpg?text=RelatedThumb)](https://example.com/other-post-999.tpo)

## [Tiêu đề bài khác liên quan](https://example.com/other-post-999.tpo)

Nội dung bài thật sau hai ảnh bọc link, đủ dài để app parse và hiển thị tóm tắt.`);
    await openFirstArticle(page);
    await expect(page.locator('img[src*="SelfZoom"]')).toHaveCount(1);
    await expect(page.locator('img[src*="RelatedThumb"]')).toHaveCount(0);
  });
});

test.describe('Caption ảnh như bài gốc', () => {
  test('caption thật dòng sau ảnh gắn vào ảnh; alt tự sinh không lọt', async ({ page }) => {
    await mockJina(page, `[![Image 21: Hộ linh tráng sĩ - Ảnh 1.](https://placehold.co/600x400/111111/FFFFFF.jpg?text=Real1)](https://placehold.co/600x400/111111/FFFFFF.jpg?text=Real1)

Đoàn phim Hộ linh tráng sĩ trong buổi ra mắt phim tại TP.HCM ngày 25-8 - Ảnh: NSXCC

Thân bài sau ảnh, đủ dài để app parse và hiển thị tóm tắt.`);
    await openFirstArticle(page);
    await expect(page.locator('img[src*="Real1"]')).toHaveCount(1);
    await expect(page.getByText('Đoàn phim Hộ linh tráng sĩ trong buổi ra mắt phim tại TP.HCM ngày 25-8 - Ảnh: NSXCC')).toBeVisible();
    await expect(page.getByText('Hộ linh tráng sĩ - Ảnh 1.')).toHaveCount(0);
  });

  test('caption trần không có keyword (Tiền Phong) vẫn gắn đúng 1 lần', async ({ page }) => {
    await mockJina(page, `![Image 2: dctt-5.jpg](https://placehold.co/600x400/123456/FFFFFF.jpg?text=AntdImg)

Châu Bùi và bố tại bản Mường (Xóm Khanh - Cục Phương)

Thân bài theo sau caption, đủ dài để app parse và hiển thị tóm tắt.`);
    await openFirstArticle(page);
    await expect(page.locator('img[src*="AntdImg"]')).toHaveCount(1);
    await expect(page.getByText('Châu Bùi và bố tại bản Mường (Xóm Khanh - Cục Phương)')).toHaveCount(1);
  });

  test('HTML entity trong caption được decode', async ({ page }) => {
    await mockJina(page, `![Image 3: x](https://placehold.co/600x400/CCCCCC/FFFFFF.jpg?text=EntImg)

C&aacute;i &ocirc;m của L&ecirc; Giang Patrik d&agrave;nh cho bạn g&aacute;i (Ảnh: Cu Đồng)

Thân bài kiểm tra decoding entity, đủ dài để app parse và hiển thị tóm tắt.`);
    await openFirstArticle(page);
    await expect(page.getByText('Cái ôm của Lê Giang Patrik dành cho bạn gái (Ảnh: Cu Đồng)')).toBeVisible();
    await expect(page.getByText('C&aacute;i')).toHaveCount(0);
  });
});

test.describe('Đường HTML: lazyload + figcaption + related <a>', () => {
  test('ảnh data-src hiện với figcaption thật; ảnh trong <a> bài khác bị loại', async ({ page }) => {
    const textOnly = `Bài viết kiểm tra đường HTML fallback khi Jina không bắt được ảnh. Nội dung phải đủ ba trăm ký tự để vượt ngưỡng tối thiểu của hàm tải bài, nhờ vậy bước merge media từ HTML được kích hoạt và các assertion về ảnh lazyload, figcaption cùng ảnh related bọc trong thẻ neo có ý nghĩa.`.repeat(2);
    await mockJina(page, textOnly);

    const articleHtml = `<html><body><div class="detail-page"><div class="detail-content">
<figure><img class="lazyload" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-src="${P('LazyReal', '123456')}" alt="Châu Bùi - Ảnh 1."><noscript><img src="${P('LazyReal', '123456')}" alt="Châu Bùi"></noscript><figcaption>Châu Bùi và bố tại bản Mường</figcaption></figure>
<p>Đoạn văn trong bài sau ảnh nội dung, có đủ độ dài để vùng nội dung được nhận diện khi quét media.</p>
<a class="cms-link" href="https://example.com/other-post-123.tpo"><figure><img class="lazyload" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-src="${P('RelatedLazy', '999999')}" alt="Tin khác"><noscript><img src="${P('RelatedLazy', '999999')}" alt="Tin khác"></noscript></figure></a>
</div></div></body></html>`;
    await page.route('**/api/fetch**', async (route) => {
      const decoded = decodeURIComponent(route.request().url());
      if (decoded.includes(FIRST.link)) {
        await route.fulfill({ status: 200, contentType: 'text/html', body: articleHtml });
        return;
      }
      await route.fallback();
    });

    await openFirstArticle(page);
    await expect(page.locator('img[src*="LazyReal"]').first()).toBeVisible();
    await expect(page.getByText('Châu Bùi và bố tại bản Mường')).toBeVisible();
    await expect(page.locator('img[src*="RelatedLazy"]')).toHaveCount(0);
  });

  test('backfill: Jina gộp alt về "Image N" → caption kéo từ figcaption HTML cùng file', async ({ page }) => {
    // Trang gallery ANTĐ/VnE: markdown chỉ có ![Image 1](a.jpg) ![Image 2](b.jpg)
    // (alt placeholder, không dòng caption sau ảnh) → Jina có ≥2 ảnh nên KHÔNG
    // merge media HTML; caption thật chỉ còn trong <figcaption> → backfill khớp
    // theo file phải gắn được caption vào 2 ảnh Jina.
    const imgA = P('EaSuck99', '444444', '111111');
    const imgB = P('ObamaVN98', '555555', '222222');
    await mockJina(page, `![Image 1](${imgA})

![Image 2](${imgB})

Nội dung bài viết kiểu trang gallery, hai ảnh đặt cạnh nhau không kèm dòng chú
thích nào sau ảnh trong markdown — caption nằm trong HTML bài gốc.`);
    const html = `<html><body><div class="detail-content">
<figure><img src="${imgA}" alt=""><figcaption>Đại sứ Mỹ Kirby ở EA Suck, Đắk Lắk (Ảnh: TT)</figcaption></figure>
<p>Đoạn nội dung giữa hai ảnh giúp vùng nội dung được nhận diện đúng khi quét caption.</p>
<figure><img src="${imgB}" alt=""><figcaption>Obama trong chuyến thăm Việt Nam (Ảnh: FBNV)</figcaption></figure>
</div></body></html>`;
    await page.route('**/api/fetch**', async (route) => {
      const decoded = decodeURIComponent(route.request().url());
      if (decoded.includes(FIRST.link)) {
        await route.fulfill({ status: 200, contentType: 'text/html', body: html });
        return;
      }
      await route.fallback();
    });
    await openFirstArticle(page);
    await expect(page.getByText('Đại sứ Mỹ Kirby ở EA Suck, Đắk Lắk (Ảnh: TT)')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Obama trong chuyến thăm Việt Nam (Ảnh: FBNV)')).toBeVisible({ timeout: 15_000 });
  });

  test('player JS data-vid (host trần) vào được tóm tắt dù Jina có ≥2 ảnh', async ({ page }) => {
    // Thanh Niên: player là <div type="VideoStream" data-vid="host/path.mp4"> —
    // markdown của Jina KHÔNG chứa link stream nào (chỉ có ảnh). Jina ≥2 ảnh nên
    // cổng merge cũ (jinaMediaCount < 2) đóng → video biến mất khỏi tóm tắt.
    // Case này khoá lại: video phải được hút từ HTML, và URL phải được ghép
    // https:// (data-vid ghi host trần, không scheme) mới phát được.
    await mockJina(page, `![Image 1](${P('LhA', '111111')})

![Image 2](${P('LhB', '222222')})

Thân bài đủ dài để vượt ngưỡng tối thiểu, mô phỏng bài Thanh Niên nhúng player
video bằng JS nên markdown của Jina không chứa link stream nào cả.`);
    const html = `<html><body><div class="detail-content">
<p>Đoạn văn trước player, đủ dài để vùng nội dung được nhận diện khi quét media.</p>
<div class="VCSortableInPreviewMode" type="VideoStream" embed-type="4" data-vid="thanhnien.mediacdn.vn/325084952045817856/2026/9/8/premiere-len-huong-test.mp4" data-autoplay="false"></div>
<p>Đoạn văn sau player trong bài gốc.</p>
</div></body></html>`;
    await page.route('**/api/fetch**', async (route) => {
      const decoded = decodeURIComponent(route.request().url());
      if (decoded.includes(FIRST.link)) {
        await route.fulfill({ status: 200, contentType: 'text/html', body: html });
        return;
      }
      await route.fallback();
    });
    await openFirstArticle(page);
    await expect(page.locator('video[src*="premiere-len-huong-test.mp4"]')).toHaveCount(1);
  });
});

test.describe('Media đan xen bố cục bài gốc', () => {
  test('3 ảnh ở 3 vị trí: đủ số, không trùng, caption không dồn', async ({ page }) => {

    await mockJina(page, `Đoạn mở đầu trước ảnh thứ nhất để media có vị trí tham chiếu trong bố cục bài viết gốc.

![Image 1: a](https://placehold.co/600x400/111111/FFFFFF.jpg?text=Media1)

Đoạn văn giữa thứ nhất nối tiếp nội dung, đủ độ dài để việc đan xen media theo tỉ lệ ký tự có ý nghĩa.

![Image 2: b](https://placehold.co/600x400/222222/FFFFFF.jpg?text=Media2)

Đoạn văn giữa thứ hai tiếp tục diễn biến, tránh kết thúc sớm để không dồn media về cuối bài.

![Image 3: c](https://placehold.co/600x400/333333/FFFFFF.jpg?text=Media3)

Đoạn kết tổng hợp lại toàn bộ diễn biến của sự kiện được nhắc trong bài báo gốc này.`);

    await openFirstArticle(page);
    await expect(page.locator('img[src*="Media1"]')).toHaveCount(1);
    await expect(page.locator('img[src*="Media2"]')).toHaveCount(1);
    await expect(page.locator('img[src*="Media3"]')).toHaveCount(1);
  });
});

// HTML bài gốc cho các kiểm thử media; giữ handler RSS cho URL khác.
function mockArticleHtml(page: Page, link: string, html: string) {
  return page.route('**/api/fetch?url=**', (route) => {
    if (decodeURIComponent(route.request().url()).includes(link)) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    }
    return route.fallback();
  });
}

// File audio THẬT (WAV im lặng tự sinh) + giả lập HTTP Range như CDN thật
// (cdn.tienphong.vn trả 206). Trả 200 trần thì media element coi nguồn là không tua
// được → seekable rỗng → gán currentTime bị kẹp về 0 TRONG IM LẶNG, và test sẽ đỏ dù
// code đúng. seek() cũng thoát sớm khi dur = 0 nên mock bằng URL chết là xanh giả.
function mockPaperAudio(page: Page, seconds = 4) {
  return page.route('**/audios/abc/podcast.mp3', (route) => {
    const buf = wavSilence(seconds);
    const m = /bytes=(\d+)-(\d*)/.exec(route.request().headers()['range'] || '');
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : buf.length - 1;
      return route.fulfill({
        status: 206,
        headers: {
          'Content-Type': 'audio/wav',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${buf.length}`,
          'Content-Length': String(end - start + 1),
        },
        body: buf.subarray(start, end + 1),
      });
    }
    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(buf.length),
      },
      body: buf,
    });
  });
}

test.describe('Audio bản đọc của tòa soạn (Tiền Phong…)', () => {
  // Nguyên văn hình dạng thẻ trên trang Tiền Phong: bị chính trang ẨN đi
  // (visibility:hidden) vì nút play hiển thị là JS riêng.
  const TP_HTML = `<html><head><meta property="og:image" content="${P('Hero', 'EEEEEE', '333333')}"></head><body>
<div class="main-content">
<p>Thân bài thật của bài báo, đủ dài để parser coi đây là vùng nội dung hợp lệ.</p>
<audio style="visibility: hidden; width: 0; height: 0;" playsinline preload="metadata" src="https://cdn.tienphong.vn/audios/abc/podcast.mp3"></audio>
</div></body></html>`;

  test('Jina bắt ≥2 ảnh: audio vẫn hiện (không đi qua cổng gộp media)', async ({ page }) => {
    // 2 ảnh từ Jina = đúng nhánh `jinaMediaCount >= 2`, nơi htmlToMerge chỉ còn
    // lại video. Audio dùng chung cổng đó thì ca này mất thanh nghe — đây là
    // hồi quy mà nhánh `toMerge` trong loadArticleContent sinh ra để chặn.
    // Ảnh phải nằm SAU "Markdown Content:" — stripJinaHeader (summarize.ts:519)
    // cắt sạch phần trước mốc đó, ảnh đặt lên trên sẽ biến mất trong im lặng.
    const jinaMd = JINA_MARKDOWN.replace(
      'Markdown Content:',
      `Markdown Content:\n\n![A](${P('A', 'AAAAAA')})\n\n![B](${P('B', 'BBBBBB')})`,
    );
    await mockJina(page, jinaMd);
    await mockArticleHtml(page, FIRST.link, TP_HTML);
    await openFirstArticle(page);
    // Ảnh A/B CHỈ có trong markdown Jina → thấy nó = blocks Jina đã THAY blocks
    // HTML fast-path (ArticleScreen:182 `setBlocks(b)`). Phải neo vào mốc này rồi
    // mới khẳng định audio: khẳng định sớm là đang nhìn blocks fast-path — lúc
    // nào cũng có audio, test xanh vô nghĩa (đã thử: bỏ fix mà vẫn xanh).
    await expect(page.locator('img[src*="AAAAAA"]')).toHaveCount(1);
    await expect(page.getByText('BẢN ĐỌC CỦA VNEXPRESS')).toBeVisible();
    await expect(page.locator('audio[src*="podcast.mp3"]')).toHaveCount(1);
    // Có bản đọc của báo → nút "Nghe" (đọc bản tóm tắt) phải bị khoá.
    // Khẳng định thẳng aria-disabled: TouchableOpacity của react-native-web render
    // ra <div> nên toBeDisabled() của Playwright không coi là disabled (div không
    // phải control gốc) — nhưng aria-disabled + pointer-events:none mới là thứ
    // thực sự chặn bấm.
    await expect(page.getByLabel('Bài có bản đọc của tòa soạn, dùng thanh nghe bên dưới'))
      .toHaveAttribute('aria-disabled', 'true');
  });

  test('bài không có audio → không dựng thanh nghe', async ({ page }) => {
    await mockArticleHtml(page, FIRST.link, `<html><body><div class="main-content"><p>Bài thường, không có audio của tòa soạn.</p></div></body></html>`);
    await openFirstArticle(page);
    await expect(page.locator('audio')).toHaveCount(0);
  });

  // TUA. Ca này sinh ra từ câu hỏi "không thể tua?" của người dùng, và đã xác nhận
  // là ĐÚNG: bản cũ gắn Pressable.onPress, mà react-native-web đi nhánh sự kiện
  // `click` cho phần tử không tương tác — ở nhánh đó `currentTarget` chưa có lúc
  // getter locationX chạy, nên locationX trả undefined và hàm tua thoát sớm. Đã đo:
  // gắn lại Pressable.onPress thì ca này ĐỎ, dùng responder thì XANH.
  // Giờ dùng onResponderGrant/Move → chạm và KÉO đều tua (onPress chỉ bắn lúc nhả
  // tay nên kéo không ăn).
  //
  // Phải phát file audio THẬT (WAV im lặng tự sinh): seek() thoát sớm khi dur = 0,
  // nên mock bằng URL chết thì test này xanh giả.
  test('tua được: chạm 3/4 thanh → đồng hồ nhảy khỏi 0:00', async ({ page }) => {
    await mockPaperAudio(page);
    await mockArticleHtml(page, FIRST.link, TP_HTML);
    await openFirstArticle(page);

    const bar = page.getByLabel('Tua bản đọc');
    await expect(bar).toBeVisible();
    // Chờ metadata: chưa có duration thì seek() tự huỷ, chạm xong vẫn 0:00.
    await expect(page.getByText(/\/\s*0:04/).first()).toBeVisible();

    // page.mouse.click dùng toạ độ VIEWPORT và KHÔNG tự cuộn (locator.click mới
    // cuộn). Thanh tua nằm dưới hero + tiêu đề nên phải tự đưa vào màn hình trước,
    // không thì cú chạm rơi ra ngoài viewport và test đỏ oan.
    await bar.scrollIntoViewIfNeeded();
    const box = (await bar.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);

    // 4s × 3/4 = 3.0s; sai số ±1px trên thanh ~300px ≈ ±0.013s nên chỉ lệch tối đa
    // 1 giây ở mép làm tròn — nhận cả 0:02 lẫn 0:03, nhưng KHÔNG nhận 0:00.
    await expect(page.getByText(/0:0[23]\s*\/\s*0:04/).first()).toBeVisible();
  });

  // RỜI BÀI. Người dùng báo: đang nghe rồi mở bài khác thì tiếng vẫn chạy.
  // Cơ chế: bấm bài liên quan gọi navigation.push('Article') (ArticleScreen:321) —
  // màn hình cũ bị ĐẨY XUỐNG chứ không unmount, nên cleanup lúc unmount không chạy,
  // thẻ <audio> vẫn nằm trong DOM và trình duyệt phát tiếp.
  // Trạng thái đọc từ DOM chứ không qua UI: sau khi push, thanh nghe của bài cũ
  // không còn nhìn thấy được nữa, nên không thể khẳng định qua getByLabel.
  test('mở bài khác (push, chỉ blur) → bản đọc của báo phải dừng', async ({ page }) => {
    await mockPaperAudio(page, 222);
    await mockArticleHtml(page, FIRST.link, TP_HTML);
    await openFirstArticle(page);

    await page.getByLabel('Phát bản đọc của báo').click();
    // Trả về "số thẻ audio|paused" — gộp cả hai vào một probe để phân biệt được
    // "đã dừng" với "màn hình cũ bị unmount nên không còn thẻ nào" (bẫy false-green).
    const audioState = () => page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('audio')) as HTMLAudioElement[];
      return els.length ? `${els.length}|${els.map((a) => a.paused).join(',')}` : 'none';
    });
    await expect.poll(audioState).toBe('1|false');

    await page.getByText(SECOND.title).last().click();

    // '1|true' = màn hình cũ VẪN mounted (đúng nhánh blur) và đã pause.
    // 'none' = bị unmount → ca này không còn kiểm chứng được đường blur nữa.
    await expect.poll(audioState).toBe('1|true');
  });
});

// WAV im lặng — Chromium giải mã PCM không cần codec ngoài, nên duration có ngay
// và không phụ thuộc mạng. 8kHz mono 8-bit: 8000 byte/giây, mẫu 8-bit lấy 128 làm
// mức 0.
function wavSilence(seconds: number): Buffer {
  const rate = 8000;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n, 128);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34);
  buf.write('data', 36); buf.writeUInt32LE(n, 40);
  return buf;
}
