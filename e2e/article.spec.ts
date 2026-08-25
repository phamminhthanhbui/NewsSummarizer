// E2E: Article — tóm tắt AI (mock), cache history, lưu/bỏ lưu, copy, nghe,
// bài liên quan, quay lại. Fab không có label → chọn theo vị trí trong floatBar.
import { test, expect, type Page } from '@playwright/test';
import {
  FEED_ITEMS, KEYS, SUMMARY_TEXT, mockNetwork, seedStorage, getStorage,
  gotoTab, waitForFeedLoaded,
} from './helpers';

const FIRST = FEED_ITEMS[0];

async function openFirstArticle(page: Page) {
  await page.getByText(FIRST.title).first().click();
  await expect(page.getByText('AI TÓM TẮT')).toBeVisible({ timeout: 15_000 });
}

// floatBar: [Bài gốc] [refresh] [bookmark] — Text 'Bài gốc' → ông nội là floatBar
function floatBarButtons(page: Page) {
  const bar = page.getByText('Bài gốc').locator('xpath=../..');
  return { bar, refresh: bar.locator('xpath=./div[2]'), bookmark: bar.locator('xpath=./div[3]') };
}

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
  await page.goto('/');
  await waitForFeedLoaded(page);
});

test.describe('Tóm tắt AI', () => {
  test('mở bài: tự tóm tắt, hiện summary mock', async ({ page }) => {
    await openFirstArticle(page);
    await expect(page.getByText(SUMMARY_TEXT)).toBeVisible({ timeout: 20_000 });
  });

  test('summary lưu vào history storage', async ({ page }) => {
    await openFirstArticle(page);
    await expect(page.getByText(SUMMARY_TEXT)).toBeVisible({ timeout: 20_000 });
    await expect(async () => {
      const raw = await getStorage(page, KEYS.history);
      expect(raw).toBeTruthy();
      const history = JSON.parse(raw!);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].url).toBe(FIRST.link);
      expect(history[0].summary).toBeTruthy();
    }).toPass({ timeout: 20_000 });
  });

  test('mở lại bài đã có cache: không gọi lại LLM', async ({ page }) => {
    let llmCalls = 0;
    await page.route('**/api/llm', async (route) => {
      llmCalls++;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: SUMMARY_TEXT } }] }),
      });
    });

    await openFirstArticle(page);
    await expect(page.getByText(SUMMARY_TEXT)).toBeVisible({ timeout: 20_000 });
    await expect(async () => {
      const raw = await getStorage(page, KEYS.history);
      expect(raw && JSON.parse(raw).length).toBeGreaterThan(0);
    }).toPass({ timeout: 20_000 });
    const callsFirst = llmCalls;
    expect(callsFirst).toBeGreaterThan(0);

    // Quay Home mở lại — cache hit, không thêm call nào
    await gotoTab(page, 'Trang chủ');
    await openFirstArticle(page);
    await expect(page.getByText(SUMMARY_TEXT)).toBeVisible();
    await page.waitForTimeout(1500);
    expect(llmCalls).toBe(callsFirst);
  });

  test('không lưu API key: vẫn tóm tắt được nhờ key mặc định NVIDIA', async ({ page }) => {
    await page.evaluate(() => {
      ['@nim_key', '@openai_key', '@anthropic_key', '@google_key', '@openrouter_key', '@custom_key']
        .forEach((k) => localStorage.removeItem(k));
    });
    await openFirstArticle(page);
    await expect(page.getByText(SUMMARY_TEXT)).toBeVisible({ timeout: 20_000 });
  });

  test('fab refresh tóm tắt lại, summary vẫn hiện', async ({ page }) => {
    // Chậm mock LLM ~900ms để bắt được trạng thái "Đang tóm tắt..."
    await page.route('**/api/llm', async (route) => {
      await new Promise((r) => setTimeout(r, 900));
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: SUMMARY_TEXT } }] }),
      });
    });
    await openFirstArticle(page);
    await expect(page.getByText(SUMMARY_TEXT)).toBeVisible({ timeout: 20_000 });
    await floatBarButtons(page).refresh.click();
    await expect(page.getByText('Đang tóm tắt...')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(SUMMARY_TEXT)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('Lưu / bỏ lưu', () => {
  // Tiêu đề bài hiện ở NHIỀU chỗ visible cùng lúc trên tab Đã lưu (card danh sách
  // + các section khác) → strict mode bắt buộc .first(). Filter visible để không
  // trúng bản copy ẩn trong tab screen RN-web vẫn giữ mounted.
  const visibleTitle = (page: Page) => page.getByText(FIRST.title).filter({ visible: true }).first();

  test('bấm bookmark: lưu vào storage; tab Đã lưu hiện bài', async ({ page }) => {
    await openFirstArticle(page);
    await floatBarButtons(page).bookmark.click();
    await expect(async () => {
      const raw = await getStorage(page, KEYS.saved);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!).some((s: any) => s.link === FIRST.link)).toBe(true);
    }).toPass({ timeout: 10_000 });

    await gotoTab(page, 'Đã lưu');
    await expect(visibleTitle(page)).toBeVisible();
  });

  test('bấm bookmark lần hai: bỏ lưu', async ({ page }) => {
    await seedStorage(page, { [KEYS.saved]: JSON.stringify([FIRST]) });
    await page.reload();
    await waitForFeedLoaded(page);
    await openFirstArticle(page);
    await floatBarButtons(page).bookmark.click(); // đang lưu → bỏ lưu
    await expect(async () => {
      const raw = await getStorage(page, KEYS.saved);
      const list = raw ? JSON.parse(raw) : [];
      expect(list.some((s: any) => s.link === FIRST.link)).toBe(false);
    }).toPass({ timeout: 10_000 });
  });

  test('bỏ lưu từ tab Đã lưu: hiện empty', async ({ page }) => {
    await seedStorage(page, { [KEYS.saved]: JSON.stringify([FIRST]) });
    await page.reload();
    await waitForFeedLoaded(page);
    await gotoTab(page, 'Đã lưu');
    await expect(visibleTitle(page)).toBeVisible();
    await page.getByLabel('Bỏ lưu bài').click();
    await expect(page.getByText('Chưa có bài đã lưu')).toBeVisible();
  });
});

test.describe('Các nút khác', () => {
  test('Copy tóm tắt không crash', async ({ page }) => {
    await openFirstArticle(page);
    await expect(page.getByText(SUMMARY_TEXT)).toBeVisible({ timeout: 20_000 });
    await page.getByText('Copy tóm tắt').click();
    await page.waitForTimeout(300);
    await expect(page.getByText(SUMMARY_TEXT)).toBeVisible();
  });

  test('Nghe tóm tắt bật trạng thái Dừng', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await openFirstArticle(page);
    await expect(page.getByText(SUMMARY_TEXT)).toBeVisible({ timeout: 20_000 });
    await page.getByLabel('Nghe tóm tắt').click();
    await expect(page.getByLabel('Dừng đọc')).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Dừng đọc').click();
  });

  test('nút back quay về Home', async ({ page }) => {
    await openFirstArticle(page);
    await page.getByLabel('Quay lại').click();
    await expect(page.getByText('TIN MỚI NHẤT')).toBeVisible({ timeout: 10_000 });
  });

  test('bài viết liên quan hiển thị', async ({ page }) => {
    await openFirstArticle(page);
    await expect(page.getByText('Bài viết liên quan')).toBeVisible({ timeout: 15_000 });
  });
});
