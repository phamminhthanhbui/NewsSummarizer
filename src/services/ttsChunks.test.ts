// Self-check cho buildTtsChunks + wordIndexAtChar:
// node --experimental-strip-types src/services/ttsChunks.test.ts
import assert from 'node:assert';
import { buildTtsChunks, wordIndexAtChar, type TtsWord } from './ttsChunks.ts';

// wordMap output mẫu: đoạn 1 (4 từ) + đoạn bullet (4 từ, từ đầu là marker •)
const paras: TtsWord[][] = [
  [
    { text: 'Xin', flat: 0 }, { text: 'chào', flat: 1 },
    { text: 'Việt', flat: 2 }, { text: 'Nam.', flat: 3 },
  ],
  [
    { text: '•', flat: 4 }, { text: 'Số', flat: 5 },
    { text: 'liệu:', flat: 6 }, { text: '2026.', flat: 7 },
  ],
];
const chunks = buildTtsChunks(paras);

// 1. Marker gạch đầu dòng bị bỏ khỏi chunk (không đọc thành "gạch")
assert.ok(chunks.every((c) => !/^•\s/.test(c.text)), 'marker • vẫn lọt vào chunk');
assert.equal(chunks.length, 1, 'ít từ phải gộp 1 cụm');

// 2. starts[i] trỏ đúng vị trí từng từ trong chunk.text; flats khớp số từ
const c = chunks[0];
const words = c.text.split(' ');
assert.equal(c.starts.length, c.flats.length);
assert.equal(c.starts.length, words.length); // 7 từ nói (8 trừ marker)
words.forEach((w, i) => {
  assert.equal(c.text.slice(c.starts[i], c.starts[i] + w.length), w, `starts[${i}] lệch cho từ "${w}"`);
  if (i > 0) assert.ok(c.starts[i] > c.starts[i - 1], 'starts phải tăng ngặt');
});
assert.equal(c.flats[0], 0); // "Xin"
assert.equal(c.flats[c.flats.length - 1], 7); // "2026." — flat không bị hở do marker

// 3. wordIndexAtChar: boundary charIndex thường rơi NGAY ĐẦU từ → trả đúng từ;
// giữa từ → từ đó; ngoài biên → kẹp 0 / từ cuối
assert.equal(wordIndexAtChar(c.starts, 0), 0); // "Xin"
assert.equal(wordIndexAtChar(c.starts, 3), 0); // cuối "Xin" (chưa chạm "chào")
assert.equal(wordIndexAtChar(c.starts, 4), 1); // đầu "chào"
assert.equal(wordIndexAtChar(c.starts, 6), 1); // giữa "chào"
assert.equal(wordIndexAtChar(c.starts, 999), c.starts.length - 1);
assert.equal(wordIndexAtChar(c.starts, -5), 0);

// 4. Ngắt cụm: >=22 từ kết thúc câu → flush; >=36 từ cắt cứng
const long: TtsWord[][] = [
  Array.from({ length: 40 }, (_, i) => ({ text: i === 21 ? 'xong.' : `w${i}`, flat: i })),
];
const many = buildTtsChunks(long);
assert.ok(many.length >= 2, '40 từ phải tách >=2 cụm');
assert.ok(many[0].flats.length <= 36, 'cụm không vượt 36 từ');
assert.equal(many[0].flats.length, 22); // từ 22 ("xong.") kết thúc câu → flush

console.log('ttsChunks: all checks passed');
