// Settings retained after remote summarization was retired.
import { test, expect } from '@playwright/test';
import { FEED_ITEMS, KEYS, mockNetwork, seedStorage, getStorage } from './helpers';

test.beforeEach(async({page})=>{
  await mockNetwork(page);
  await seedStorage(page,{[KEYS.feedsCache]:JSON.stringify(FEED_ITEMS),[KEYS.feedsCacheTime]:String(Date.now())});
  await page.addInitScript((key)=>{if(localStorage.getItem(key)===null)localStorage.setItem(key,'light');},KEYS.themeMode);
  await page.goto('/');
  await page.getByRole('tab',{name:'Cài đặt',exact:true}).click();
});
test('cài đặt không còn mục cấu hình hay thông tin tóm tắt',async({page})=>{
  await expect(page.getByText('Tóm tắt bằng quy tắc',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Nhà cung cấp AI',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Model AI',{exact:true})).toHaveCount(0);
  await expect(page.getByText('API Key',{exact:true})).toHaveCount(0);
});
test('chuyển sáng tối và giữ lựa chọn qua reload',async({page})=>{
  await page.getByTestId('dark-mode-switch').click();
  await expect.poll(()=>getStorage(page,KEYS.themeMode)).toBe('dark');
  await page.reload();
  await page.getByRole('tab',{name:'Cài đặt',exact:true}).click();
  await expect(page.getByText('Đang bật',{exact:true})).toBeVisible();
  await page.getByTestId('dark-mode-switch').click();
  await expect.poll(()=>getStorage(page,KEYS.themeMode)).toBe('light');
});
test('lưu và khôi phục cao độ, tốc độ giọng đọc',async({page})=>{
  await seedStorage(page,{[KEYS.pitch]:'1.2',[KEYS.rate]:'0.8'});
  await page.reload();
  await page.getByRole('tab',{name:'Cài đặt',exact:true}).click();
  await expect(page.getByText('1.2',{exact:true})).toBeVisible();
  await expect(page.getByText('0.8',{exact:true})).toBeVisible();
  await page.getByText('Lưu cài đặt',{exact:true}).click();
  await expect(page.getByText('Đã lưu',{exact:true})).toBeVisible();
  expect(await getStorage(page,KEYS.pitch)).toBe('1.2');
  expect(await getStorage(page,KEYS.rate)).toBe('0.8');
});
test('nâng cấp xóa credential cũ nhưng giữ bài đã lưu và giọng đọc',async({page})=>{
  await seedStorage(page,{'@llm_provider':'retired-provider','@nim_key':'test-old-secret','@nim_model':'retired-model','@ai_unlocked':'1',[KEYS.saved]:JSON.stringify([FEED_ITEMS[1]]),[KEYS.pitch]:'1.1'});
  await page.reload();
  for(const key of ['@llm_provider','@nim_key','@nim_model','@ai_unlocked'])await expect.poll(()=>getStorage(page,key)).toBeNull();
  expect(JSON.parse((await getStorage(page,KEYS.saved))||'[]')).toEqual([FEED_ITEMS[1]]);
  expect(await getStorage(page,KEYS.pitch)).toBe('1.1');
});
