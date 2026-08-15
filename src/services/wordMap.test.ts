// Self-check cho buildWordMap: node src/services/wordMap.test.ts
import assert from 'node:assert';
import { buildWordMap } from './wordMap.ts';

// 1. Một đoạn
{
  const s = 'Xin chào Việt Nam';
  const { offsets, paras } = buildWordMap(s);
  assert.deepEqual(offsets, [0, 4, 9, 14]);
  assert.equal(paras.length, 1);
  assert.deepEqual(paras[0].map(w => w.text), ['Xin', 'chào', 'Việt', 'Nam']);
  for (const w of paras[0]) assert.equal(s.slice(offsets[w.flat], offsets[w.flat] + w.text.length), w.text);
}

// 2. Nhiều đoạn (ngắt bởi \n\n và \n đơn)
{
  const s = 'Đoạn một.\n\nĐoạn hai đây.\nKết thúc.';
  const { offsets, paras } = buildWordMap(s);
  assert.equal(paras.length, 3);
  assert.deepEqual(paras[0].map(w => w.text), ['Đoạn', 'một.']);
  assert.deepEqual(paras[1].map(w => w.text), ['Đoạn', 'hai', 'đây.']);
  assert.deepEqual(paras[2].map(w => w.text), ['Kết', 'thúc.']);
  // flat index liên tục, đúng thứ tự
  const flats = paras.flat().map(w => w.flat);
  assert.deepEqual(flats, flats.map((_, i) => i));
  // offset trỏ đúng chữ trong summary
  for (const w of paras.flat()) assert.equal(s.slice(offsets[w.flat], offsets[w.flat] + w.text.length), w.text);
}

// 3. charIndex → flat word (mô phỏng onboundary): charIndex của từ nào phải map về từ đó
{
  const s = 'Tin nóng hôm nay.\n\nGiá vàng tăng mạnh.';
  const { offsets, paras } = buildWordMap(s);
  const flatOf = (charIndex: number) => {
    let lo = 0, hi = offsets.length - 1, flat = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid] <= charIndex) { flat = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return flat;
  };
  // charIndex ngay đầu mỗi từ
  paras.flat().forEach(w => assert.equal(flatOf(offsets[w.flat]), w.flat));
  // charIndex giữa từ (vd offset+2) vẫn map về từ đó
  paras.flat().forEach(w => {
    if (w.text.length > 2) assert.equal(flatOf(offsets[w.flat] + 2), w.flat);
  });
}

// 4. Rỗng
{
  const { offsets, paras } = buildWordMap('');
  assert.deepEqual(offsets, []);
  assert.deepEqual(paras, []);
}

console.log('wordMap: all checks passed');
