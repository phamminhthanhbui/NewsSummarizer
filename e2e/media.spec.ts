// E2E: pipeline ảnh/caption trong tóm tắt — các case phát sinh từ review thực tế.
// LƯU Ý: ArticleScreen chỉ hiển thị tóm tắt AI + media (ảnh kèm caption) + bài
// liên quan — KHÔNG render text thô của bài. Nên assertion chỉ trên: ảnh có/không,
// caption hiển thị, khung tóm tắt. (Phần strip widget ảnh hưởng text gửi LLM —
// không quan sát trực tiếp được qua mock LLM, nên verify qua ảnh bị lọc.)
import { test, expect, type Page } from '@playwright/test';
import {
  FEED_ITEMS, mockNetwork, waitForFeedLoaded,
} from './helpers';

const FIRST = FEED_ITEMS[0];

async function openFirstArticle(page: Page) {
  await page.getByText(FIRST.title).first().click();
  await expect(page.getByText('AI TÓM TẮT')).toBeVisible({ timeout: 15_000 });
}

// Override route Jina đăng ký SAU mockNetwork → thắng route mặc định
function mockJina(page: Page, md: string) {
  return page.route('**/api/jina**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/markdown', body: md }),
  );
}

const P = (text: string, bg: string, fg?: string) => `https://placehold.co/600x400/${bg}/${fg || 'FFFFFF'}.jpg?text=${text}`;

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
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
    await expect(page.getByText('Tóm tắt AI giả lập', { exact: false })).toBeVisible();
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
    await expect(page.getByText('Tóm tắt AI giả lập', { exact: false })).toBeVisible();
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
    // Summary dài nhiều đoạn để 2 ảnh gallery đều có chỗ đan xen (ArticleScreen
    // bỏ ảnh thừa khi summary chỉ 1 đoạn ngắn).
    await page.route('**/api/llm', async (route) => {
      const body = route.request().postData() || '';
      if (body.includes('chú thích ảnh')) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          choices: [{
            message: { content: 'Đoạn mở đầu nêu bối cảnh sự kiện và nhân vật chính của bài báo này.\n\nÝ chính thứ hai phân tích diễn biến then chốt với số liệu cụ thể từ cơ quan chức năng.\n\nÝ chính thứ ba dẫn phát biểu của chuyên gia về tác động dài hạn đối với thị trường.\n\nĐoạn kết tóm lại ý nghĩa sự kiện và hướng theo dõi trong thời gian tới.' },
          }],
        }),
      });
    });
    page.on('console', (m) => { if (m.text().includes('BF ')) console.log('BROWSER:', m.text()); });
    await openFirstArticle(page);
    await expect(page.getByText('Đại sứ Mỹ Kirby ở EA Suck, Đắk Lắk (Ảnh: TT)')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Obama trong chuyến thăm Việt Nam (Ảnh: FBNV)')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Caption dài → AI rút gọn', () => {
  const LONG_CAP = 'Tuấn Trần và Trần Thiên Tú không biết võ nhưng qua quá trình huấn luyện của Johnny Trí Nguyễn đã thành những võ sĩ thực sự trên phim - Ảnh: NSXCC';
  const SHORT_CAP = 'Tuấn Trần, Trần Thiên Tú thành võ sĩ nhờ Johnny Trí Nguyễn - Ảnh: NSXCC';

  test('đúng 1 request batch cho caption >88 ký tự; bản ngắn thay thế; caption ngắn không bị đụng', async ({ page }) => {
    let condenseCalls = 0;
    let condenseBody = '';
    await page.route('**/api/llm', async (route) => {
      const body = route.request().postData() || '';
      if (body.includes('chú thích ảnh')) {
        condenseCalls++;
        condenseBody = body;
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ choices: [{ message: { content: SHORT_CAP } }] }),
        });
        return;
      }
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: 'Tóm tắt AI giả lập: giá vàng tăng mạnh do nhu cầu trú ẩn an toàn.' } }] }),
      });
    });

    await mockJina(page, `[![Image 1: a](https://placehold.co/600x400/111111/FFFFFF.jpg?text=Long1)](https://placehold.co/600x400/111111/FFFFFF.jpg?text=Long1)

${LONG_CAP}

[![Image 2: b](https://placehold.co/600x400/222222/FFFFFF.jpg?text=Short2)](https://placehold.co/600x400/222222/FFFFFF.jpg?text=Short2)

Ninh Bình quá đẹp trong Hộ linh tráng sĩ - Ảnh: NSX

Thân bài kiểm tra condense, đủ dài để app parse và hiển thị tóm tắt.`);

    await openFirstArticle(page);
    await expect(page.getByText(SHORT_CAP)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(LONG_CAP)).toHaveCount(0);

    await expect(async () => {
      expect(condenseCalls).toBe(1);
      expect(condenseBody).toContain('Tuấn Trần và Trần Thiên Tú không biết võ');
      expect(condenseBody).not.toContain('Ninh Bình quá đẹp trong Hộ linh tráng sĩ');
    }).toPass({ timeout: 5_000 });
    await page.waitForTimeout(1500);
    expect(condenseCalls).toBe(1);
  });

  test('mở lại bài: caption đã nén lấy từ cache, không gọi AI thêm', async ({ page }) => {
    let condenseCalls = 0;
    await page.route('**/api/llm', async (route) => {
      const body = route.request().postData() || '';
      if (body.includes('chú thích ảnh')) {
        condenseCalls++;
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ choices: [{ message: { content: SHORT_CAP } }] }),
        });
        return;
      }
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: 'Tóm tắt AI giả lập: giá vàng tăng mạnh do nhu cầu trú ẩn an toàn.' } }] }),
      });
    });

    await mockJina(page, `[![Image 1: a](https://placehold.co/600x400/111111/FFFFFF.jpg?text=Long1)](https://placehold.co/600x400/111111/FFFFFF.jpg?text=Long1)

${LONG_CAP}

Thân bài cho test cache caption, đủ dài để app parse và hiển thị tóm tắt.`);

    await openFirstArticle(page);
    await expect(page.getByText(SHORT_CAP)).toBeVisible({ timeout: 15_000 });
    expect(condenseCalls).toBe(1);

    await page.getByLabel('Quay lại').click();
    await expect(page.getByText('ĐỌC NHIỀU NHẤT')).toBeVisible({ timeout: 10_000 });
    await page.getByText(FIRST.title).first().click();
    await expect(page.getByText('AI TÓM TẮT')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(SHORT_CAP)).toBeVisible();
    await page.waitForTimeout(1500);
    expect(condenseCalls).toBe(1);
  });
});

test.describe('Media đan xen bố cục bài gốc', () => {
  test('3 ảnh ở 3 vị trí: đủ số, không trùng, caption không dồn', async ({ page }) => {
    const FOUR_PARAS = 'Đoạn mở đầu nêu bối cảnh sự kiện và nhân vật chính của bài báo này.\n\nÝ chính thứ hai phân tích diễn biến then chốt với số liệu cụ thể từ cơ quan chức năng.\n\nÝ chính thứ ba dẫn phát biểu của chuyên gia về tác động dài hạn đối với thị trường.\n\nĐoạn kết tóm lại ý nghĩa sự kiện và hướng theo dõi trong thời gian tới.';
    await page.route('**/api/llm', async (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: FOUR_PARAS } }] }),
      }),
    );
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
