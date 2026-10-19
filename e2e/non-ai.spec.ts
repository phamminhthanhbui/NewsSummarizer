import { test, expect, type Page } from '@playwright/test';
import { FEED_ITEMS, KEYS, mockNetwork, seedStorage, getStorage } from './helpers';

const FIRST = FEED_ITEMS[0];
const paragraphs = [
  'Ngày 5/10, UBND TP.HCM công bố kế hoạch cải tạo tuyến đường Nguyễn Văn Linh với kinh phí dự kiến 125,5 tỷ đồng.',
  'Dự án gồm sửa mặt đường, bổ sung đèn chiếu sáng và cải thiện hệ thống thoát nước tại các điểm thường xuyên ngập.',
  'Ban quản lý dự án cho biết công trình được chia thành hai giai đoạn để hạn chế ảnh hưởng đến việc đi lại của người dân.',
  'Tuy nhiên, mức kinh phí 125,5 tỷ đồng mới là ước tính và chưa được phê duyệt chính thức.',
  'Các tuyến xe buýt vẫn hoạt động trong thời gian thi công, nhưng một số điểm dừng sẽ được điều chỉnh.',
  'Sở Giao thông sẽ công bố phương án phân luồng sau khi hoàn tất khảo sát thực địa.',
  'Theo kế hoạch, công trình dự kiến bắt đầu trong quý I năm 2027 nếu hoàn tất thủ tục đúng hạn.',
];
const caption = 'Công nhân khảo sát mặt đường và hệ thống thoát nước trên tuyến Nguyễn Văn Linh trước khi đề xuất phương án cải tạo. Ảnh: Nguyễn An.';
const html = `<html><body><div class="article-body">${paragraphs.map(p => `<p>${p}</p>`).join('')}<figure><img src="https://example.com/photo.jpg" alt="${caption}"><figcaption>${caption}</figcaption></figure></div></body></html>`;
const markdown = `Title: ${FIRST.title}\nURL Source: ${FIRST.link}\nMarkdown Content:\n\n${paragraphs.join('\n\n')}\n\n![${caption}](https://example.com/photo.jpg)`;

async function setup(page: Page, entries: Record<string, string> = {}) {
  await mockNetwork(page);
  await seedStorage(page, {
    [KEYS.feedsCache]: JSON.stringify(FEED_ITEMS), [KEYS.feedsCacheTime]: String(Date.now()),
    [KEYS.history]: '[]', [KEYS.saved]: '[]', [KEYS.themeMode]: 'light', ...entries,
  });
  await page.route('**/api/fetch?url=**', route => {
    const url = new URL(route.request().url()).searchParams.get('url') || '';
    return url === FIRST.link ? route.fulfill({ status: 200, contentType: 'text/html', body: html }) : route.fallback();
  });
  await page.route(FIRST.link, route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.route('https://example.com/photo.jpg', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#dbe2e8"/></svg>' }));
  await page.route('**/api/jina**', route => route.fulfill({ status: 200, contentType: 'text/markdown', body: markdown }));
  const providerRequests: string[] = [], errors: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') providerRequests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  return { providerRequests, errors };
}

async function openArticle(page: Page) {
  await page.getByText(FIRST.title, { exact: true }).first().click();
  await expect(page.getByText('TÓM TẮT', { exact: true })).toBeVisible();
}

async function history(page: Page) { return JSON.parse((await getStorage(page, KEYS.history)) || '[]'); }
const summaryCard = (page: Page) => page.getByTestId('summary-method').locator('xpath=..');

test('selects real sentences, preserves qualifications and original caption with zero AI requests', async ({ page }) => {
  const observed = await setup(page);
  await openArticle(page);
  await expect(page.getByTestId('summary-method')).toContainText('Chọn câu từ bài gốc');
  await expect(summaryCard(page)).toContainText('dự kiến 125,5 tỷ đồng');
  await expect(summaryCard(page)).toContainText('chưa được phê duyệt chính thức');
  await expect(summaryCard(page)).toContainText('nếu hoàn tất thủ tục đúng hạn');
  await expect(summaryCard(page)).toContainText(caption);
  await expect.poll(async () => (await history(page))[0]?.summarySource).toBe('article');
  const record = (await history(page))[0];
  expect(record).toMatchObject({ method: 'rules', summaryVersion: 'rules-v1', url: FIRST.link });
  expect(record.summary).not.toContain(caption);
  expect(record.summaryInputHash).toBeTruthy();
  await page.screenshot({ path: 'design-review/non-ai-article.png', fullPage: true });
  expect(observed.providerRequests).toEqual([]);
  expect(observed.errors).toEqual([]);
});

test('replaces old provider cache and keeps other history records and saved articles', async ({ page }) => {
  const old = { url: FIRST.link, title: FIRST.title, summary: 'LEGACY_PROVIDER_OUTPUT_DO_NOT_REUSE', date: new Date().toISOString(), source: FIRST.source };
  const other = { ...old, url: FEED_ITEMS[1].link, title: FEED_ITEMS[1].title, summary: 'Bản đã lưu của một bài khác.' };
  const observed = await setup(page, { [KEYS.history]: JSON.stringify([old, other]), [KEYS.saved]: JSON.stringify([FEED_ITEMS[1]]) });
  await openArticle(page);
  await expect(page.getByTestId('summary-method')).toContainText('Chọn câu từ bài gốc');
  await expect.poll(async () => (await history(page)).find((r: any) => r.url === FIRST.link)?.method).toBe('rules');
  expect(await summaryCard(page).textContent()).not.toContain(old.summary);
  expect((await history(page)).find((r: any) => r.url === FEED_ITEMS[1].link)).toEqual(other);
  expect(JSON.parse((await getStorage(page, KEYS.saved)) || '[]')).toEqual([FEED_ITEMS[1]]);
  expect(observed.providerRequests).toEqual([]);
});

test('clearly labels RSS-only output when the full article cannot be fetched', async ({ page }) => {
  const observed = await setup(page);
  await page.route('**/api/jina**', route => route.fulfill({ status: 503, body: '' }));
  await page.route('https://r.jina.ai/**', route => route.fulfill({ status: 503, body: '' }));
  await page.route(FIRST.link, route => route.fulfill({ status: 503, body: '' }));
  await page.route('**/api/fetch?url=**', route => {
    const url = new URL(route.request().url()).searchParams.get('url') || '';
    return url === FIRST.link ? route.fulfill({ status: 503, body: '' }) : route.fallback();
  });
  await openArticle(page);
  await expect(page.getByTestId('summary-method')).toContainText('Từ mô tả RSS · Chưa tải đủ bài');
  await expect(summaryCard(page)).toContainText(FIRST.description);
  await expect.poll(async () => (await history(page))[0]?.summarySource).toBe('description');
  expect(observed.providerRequests).toEqual([]);
});

test('settings have no provider controls and preserve voice and theme settings', async ({ page }) => {
  const observed = await setup(page, { '@ai_unlocked': '1', '@llm_provider': 'legacy-provider', '@nim_key': 'legacy-test-key', '@nim_model': 'legacy-model', [KEYS.pitch]: '1.1', [KEYS.rate]: '1.2' });
  await page.getByRole('tab', { name: 'Cài đặt', exact: true }).click();
  await expect(page.getByText('Tóm tắt bằng quy tắc', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Nhà cung cấp AI', { exact: true })).toHaveCount(0);
  await expect(page.getByText('API Key', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cấu hình AI nâng cao' })).toHaveCount(0);
  await page.getByText('Lưu cài đặt', { exact: true }).click();
  await expect(page.getByText('Đã lưu', { exact: true })).toBeVisible();
  expect(await getStorage(page, KEYS.pitch)).toBe('1.1');
  expect(await getStorage(page, KEYS.rate)).toBe('1.2');
  for (const key of ['@ai_unlocked', '@llm_provider', '@nim_key', '@nim_model']) expect(await getStorage(page, key)).toBeNull();
  await page.getByTestId('dark-mode-switch').click();
  await expect.poll(() => getStorage(page, KEYS.themeMode)).toBe('dark');
  expect(observed.providerRequests).toEqual([]);
  expect(observed.errors).toEqual([]);
});

test('save, copy and regenerate summary use local content with zero provider requests', async ({ page }) => {
  const observed = await setup(page);
  await openArticle(page);
  await expect(page.getByTestId('summary-method')).toContainText('Chọn câu từ bài gốc');
  await page.getByLabel('Lưu bài', { exact: true }).click();
  await expect.poll(async () => JSON.parse((await getStorage(page, KEYS.saved)) || '[]').some((i: any) => i.link === FIRST.link)).toBe(true);
  await page.getByText('Copy tóm tắt', { exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('125,5 tỷ đồng');
  await page.getByLabel('Tóm tắt lại', { exact: true }).click();
  await expect(summaryCard(page)).toContainText('chưa được phê duyệt chính thức');
  expect(observed.providerRequests).toEqual([]);
  expect(observed.errors).toEqual([]);
});
