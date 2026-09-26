// Self-check cho rankTrending: node --experimental-strip-types src/services/trending.test.ts
import assert from 'node:assert';
import { rankTrending } from './trending.ts';

const it = (link: string, hoursAgo: number) => ({
  link,
  pubDate: new Date(Date.UTC(2026, 8, 25, 12, 0, 0) - hoursAgo * 3600_000).toISOString(),
});
const links = (a: { link: string }[]) => a.map((x) => x.link);

// 8 bài, bài 1 mới nhất. Cũ nhất = sk-8.
const items = Array.from({ length: 8 }, (_, i) => it(`sk-${i + 1}`, i));

// 1. Chưa đọc gì → hoà hết → lấy bài MỚI NHẤT trước. Đây là thứ thay cho kiểu
//    xáo ngẫu nhiên cũ (vốn nhắm vào đuôi feed nên toàn bài cả chục ngày).
assert.deepEqual(links(rankTrending(items, {})), ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6']);
assert.deepEqual(links(rankTrending(items, null)), links(rankTrending(items, {})));

// 2. Lượt đọc thắng độ mới: bài CŨ NHẤT được 99 lượt phải lên đầu.
assert.equal(rankTrending(items, { 'sk-8': 99 })[0].link, 'sk-8');

// 3. Nhiều lượt đọc → xếp giảm dần, phần 0 lượt theo sau và vẫn theo độ mới.
assert.deepEqual(
  links(rankTrending(items, { 'sk-8': 5, 'sk-7': 9, 'sk-6': 1 })),
  ['sk-7', 'sk-8', 'sk-6', 'sk-1', 'sk-2', 'sk-3'],
);

// 4. Cắt đúng max, và không sửa mảng gốc (HomeScreen truyền thẳng `rest`).
const original = links(items);
assert.equal(rankTrending(items, {}, 3).length, 3);
assert.deepEqual(links(items), original, 'rankTrending không được mutate input');

// 5. pubDate hỏng/thiếu → coi như cũ nhất, KHÔNG được sinh NaN làm hỏng sort.
const broken = [{ link: 'a', pubDate: 'khong-phai-ngay' }, { link: 'b' }, it('c', 1)];
assert.deepEqual(links(rankTrending(broken, {})), ['c', 'a', 'b']);

console.log('trending: all checks passed');
