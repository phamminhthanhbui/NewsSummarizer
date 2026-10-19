// E2E: Article — chọn câu từ nguồn, cache history, lưu/bỏ lưu, copy, nghe,
// bài liên quan, quay lại. Fab không có label → chọn theo vị trí trong floatBar.
import { test, expect, type Page } from '@playwright/test';
import {
  FEED_ITEMS, KEYS, SUMMARY_TEXT, mockNetwork, seedStorage, getStorage,
  gotoTab, waitForFeedLoaded,
} from './helpers';

const FIRST = FEED_ITEMS[0];

async function openFirstArticle(page: Page) {
  await page.getByText(FIRST.title).first().click();
  await expect(page.getByText('TÓM TẮT', { exact: true })).toBeVisible({ timeout: 15_000 });
}

// floatBar: [Bài gốc] [refresh] [bookmark] — Text 'Bài gốc' → ông nội là floatBar
function floatBarButtons(page: Page) {
  const bar = page.getByText('Bài gốc').locator('xpath=../..');
  return { bar, refresh: bar.locator('xpath=./div[2]'), bookmark: bar.locator('xpath=./div[3]') };
}

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
  await seedStorage(page, { [KEYS.feedsCache]: JSON.stringify(FEED_ITEMS), [KEYS.feedsCacheTime]: String(Date.now()), [KEYS.history]: '[]', [KEYS.saved]: '[]' });
  await page.goto('/');
  await waitForFeedLoaded(page);
});

test.describe('Tóm tắt tại thiết bị', () => {
  test('mở bài: chọn câu từ nội dung nguồn', async ({ page }) => {
    await openFirstArticle(page);
    await expect(page.getByTestId('summary-method')).toContainText('Chọn câu từ bài gốc');
    await expect(page.getByText(SUMMARY_TEXT).first()).toBeVisible();
  });
  test('history ghi phương pháp và phiên bản hiện tại', async ({ page }) => {
    await openFirstArticle(page);
    await expect.poll(async () => {
      const list=JSON.parse((await getStorage(page,KEYS.history)) || '[]');
      return list.find((r:any)=>r.url===FIRST.link)?.method;
    }).toBe('rules');
  });
  test('mở lại bản đã lưu không phát sinh yêu cầu POST', async ({ page }) => {
    const posts:string[]=[];
    page.on('request',r=>{if(r.method()==='POST')posts.push(r.url())});
    await openFirstArticle(page);
    await expect(page.getByText(SUMMARY_TEXT).first()).toBeVisible();
    await page.getByLabel('Quay lại',{exact:true}).filter({visible:true}).click();
    await openFirstArticle(page);
    await expect(page.getByText(SUMMARY_TEXT).first()).toBeVisible();
    expect(posts).toEqual([]);
  });
  test('tóm tắt lại dùng nội dung trên thiết bị', async ({ page }) => {
    const posts:string[]=[];
    page.on('request',r=>{if(r.method()==='POST')posts.push(r.url())});
    await openFirstArticle(page);
    await expect(page.getByText(SUMMARY_TEXT).first()).toBeVisible();
    await page.getByLabel('Tóm tắt lại',{exact:true}).click();
    await expect(page.getByText(SUMMARY_TEXT).first()).toBeVisible();
    expect(posts).toEqual([]);
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
    await expect(page.getByText(SUMMARY_TEXT).first()).toBeVisible({ timeout: 20_000 });
    await page.getByText('Copy tóm tắt').click();
    await page.waitForTimeout(300);
    await expect(page.getByText(SUMMARY_TEXT).first()).toBeVisible();
  });

  test('Nghe tóm tắt không crash', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await openFirstArticle(page);
    await expect(page.getByText(SUMMARY_TEXT).first()).toBeVisible({ timeout: 20_000 });
    await page.getByLabel('Nghe tóm tắt').click();
    await page.waitForTimeout(500);
    // Nếu có giọng Việt web sẽ chuyển sang "Dừng đọc"; nếu không có giọng thì
    // hiện lỗi và quay về "Nghe tóm tắt" — chỉ cần không crash
    await expect(page.getByLabel('Nghe tóm tắt').or(page.getByLabel('Dừng đọc'))).toBeVisible();
  });

  test('nút back quay về Home', async ({ page }) => {
    await openFirstArticle(page);
    await page.getByLabel('Quay lại').click();
    await expect(page.getByText('Hiểu hôm nay. Sẵn sàng ngày mai.')).toBeVisible({ timeout: 10_000 });
  });

  test('bài viết liên quan hiển thị', async ({ page }) => {
    await openFirstArticle(page);
    await expect(page.getByText('Bài viết liên quan')).toBeVisible({ timeout: 15_000 });
  });

});
