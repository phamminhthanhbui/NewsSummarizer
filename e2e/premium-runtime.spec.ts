import { test, expect } from '@playwright/test';
import { mockNetwork, seedStorage, FEED_ITEMS, KEYS, getStorage, SUMMARY_TEXT } from './helpers';
test.beforeEach(async ({ page }) => {
 await mockNetwork(page);
 await seedStorage(page, { [KEYS.feedsCache]: JSON.stringify(FEED_ITEMS),[KEYS.themeMode]:'light' });
});
test('premium navigation, search and mobile layout', async ({page}) => {
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.getByText('Hiểu hôm nay. Sẵn sàng ngày mai.')).toBeVisible();
 await page.screenshot({path:'design-review/runtime-mobile.png'});
 await expect(page.getByRole('tab')).toHaveCount(5);
 await page.getByRole('tab',{name:'Khám phá'}).click();
 await page.getByPlaceholder('Tìm tiêu đề, nội dung...').fill('Trí tuệ nhân tạo');
 await expect(page.getByTestId('discoverScreen').getByTestId('feedCard').filter({hasText:FEED_ITEMS[2].title})).toBeVisible();
 await expect(page.getByTestId('discoverScreen').getByTestId('feedCard').filter({hasText:FEED_ITEMS[1].title})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 expect(errors).toEqual([]);
});
test('desktop sidebar and responsive content',async({page})=>{
 await page.setViewportSize({width:1440,height:960});await page.goto('/');
 await expect(page.getByText('ĐỌC ÍT HƠN. HIỂU NHIỀU HƠN.')).toBeVisible();
 await expect(page.getByText('Hiểu hôm nay. Sẵn sàng ngày mai.')).toBeVisible();
 await page.screenshot({path:'design-review/runtime-desktop.png'});
 const bounds=await page.getByRole('tablist').boundingBox();expect(bounds!.width).toBe(215);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('preferences persist and filter real feed data',async({page})=>{
 await page.goto('/');await page.getByLabel('Tài khoản',{exact:true}).click();
 await page.getByRole('button',{name:'Quản lý nguồn tin',exact:true}).click();
 await page.getByRole('button',{name:'Công nghệ',exact:true}).click();
 await page.getByRole('button',{name:'Lưu lựa chọn',exact:true}).click();
 await expect(page.getByRole('button',{name:'Đã lưu lựa chọn'})).toBeVisible();
 expect(JSON.parse((await getStorage(page,'@news_preferences'))!).categories).toEqual(['Công nghệ']);
 await page.getByLabel('Quay lại',{exact:true}).filter({visible:true}).click();await page.getByLabel('Quay lại',{exact:true}).filter({visible:true}).click();
 await expect(page.getByTestId('feedCard').filter({hasText:FEED_ITEMS[1].title}).filter({visible:true})).toHaveCount(0);
 await expect(page.getByText(FEED_ITEMS[2].title,{exact:true}).filter({visible:true}).first()).toBeVisible();
});
test('briefing/player queue and honest subscription state',async({page})=>{
 await page.addInitScript(() => {
  const voices = [{voiceURI:'test-vi',name:'Microsoft An Vietnamese',lang:'vi-VN',default:true,localService:true}];
  let current:any=null;
  (window as any).__speechCalls=[];
  Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class {text='';}});
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
   getVoices:()=>voices,
   get speaking(){return current!==null},
   speak:(utterance:any)=>{current=utterance;(window as any).__speechCalls.push(utterance.text);setTimeout(()=>{if(current===utterance)utterance.onstart?.({})},10)},
   cancel:()=>{const old=current;current=null;old?.onend?.({})},
   addEventListener:()=>{},removeEventListener:()=>{},pause:()=>{},resume:()=>{}
  }});
 });
 await page.goto('/');await page.getByRole('tab',{name:'Bản tin',exact:true}).click();
 await expect(page.getByText('Nắm bắt ngày mới.')).toBeVisible();
 await page.getByRole('button',{name:'Nghe bản tin',exact:true}).click();
 await expect(page.getByText('Tin 1 / 5')).toBeVisible();
 await page.getByRole('button',{name:'Phát bản tin',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__speechCalls.length)).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Dừng đọc',exact:true}).click();
 await expect(page.getByRole('button',{name:'Phát bản tin',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Tin sau',exact:true}).click();await expect(page.getByText('Tin 2 / 5')).toBeVisible();
 await page.getByLabel('Quay lại',{exact:true}).filter({visible:true}).click();await page.getByRole('tab',{name:'Cài đặt',exact:true}).click();
 await page.getByRole('button',{name:'Khám phá Plus',exact:true}).click();
 await expect(page.getByRole('button',{name:'Chưa mở thanh toán'})).toBeDisabled();
 await page.getByRole('button',{name:'Trạng thái gói'}).click();await expect(page.getByText('Bạn đang dùng gói miễn phí.')).toBeVisible();
});

test('local summary settings do not expose provider or credential controls',async({page})=>{
 await page.goto('/');await page.getByRole('tab',{name:'Cài đặt',exact:true}).click();
 await expect(page.getByText('Tóm tắt bằng quy tắc',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Nhà cung cấp AI',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Cấu hình AI nâng cao',exact:true})).toHaveCount(0);
});
test('article feedback persists locally and does not claim to send',async({page})=>{
 await seedStorage(page,{[KEYS.history]:JSON.stringify([{url:FEED_ITEMS[0].link,title:FEED_ITEMS[0].title,summary:SUMMARY_TEXT,date:new Date().toISOString(),source:FEED_ITEMS[0].source}])});
 await page.goto('/');await page.getByText(FEED_ITEMS[0].title,{exact:true}).click();
 await expect(page.getByText('TÓM TẮT',{exact:true})).toBeVisible();await page.screenshot({path:'design-review/runtime-article.png'});
 await page.getByRole('button',{name:'Góp ý bản tóm tắt',exact:true}).click();
 await page.getByPlaceholder('Mô tả thêm (không bắt buộc)').fill('Thiếu bối cảnh trong bản tóm tắt.');
 await page.getByRole('button',{name:'Lưu góp ý',exact:true}).click();
 await expect(page.getByRole('button',{name:'Đã lưu góp ý trên thiết bị'})).toBeDisabled();
 expect(JSON.parse((await getStorage(page,'@summary_feedback'))!)[0]).toMatchObject({url:FEED_ITEMS[0].link,reason:'Thiếu thông tin',note:'Thiếu bối cảnh trong bản tóm tắt.'});
});
