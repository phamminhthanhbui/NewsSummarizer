// Self-check: node --experimental-strip-types src/utils/audioSrc.test.ts
import assert from 'node:assert';
import { pickAudioUrl } from './audioSrc.ts';

const PAGE = 'https://tienphong.vn/the-thao-viet-nam-va-bai-toan-giu-vang-qua-cac-ky-asiad-post1882108.tpo';
const TP_MP3 = 'https://cdn.tienphong.vn/audios/rwou7SrcwsmIbuxOVDE9ufG3FRV5tb6VELloG1RRu-VY3CZdoA1dknVciNHpJvZ8d6VwDQDZKcBvmtKRGhqVEkM312zg-9nJvBSYy2BUS4rUOzq67OKQr8NUNNmZ5n4d/podcast.mp3';

// 1. Ca THẬT (dán nguyên từ HTML Tiền Phong): thẻ <audio> bị trang ẩn đi bằng
//    visibility:hidden — nếu bản regex nào lọc theo style hiển thị thì ca này
//    đỏ ngay. Đây là lý do tồn tại của cả module.
{
  const html = `<div class="podcast-player audio-player" id="podcast-player" data-id="1882108">`
    + `<audio style="visibility: hidden; width: 0; height: 0;" playsinline preload="metadata" src="${TP_MP3}"></audio>`
    + `</div>`;
  assert.strictEqual(pickAudioUrl(html, PAGE), TP_MP3, 'audio ẩn của Tiền Phong không bắt được');
}

// 2. src nằm ở <source> con (không có src trên thẻ <audio>).
{
  const html = `<audio id="p" controls><source src="https://cdn.a.vn/x/bai-doc.mp3" type="audio/mpeg"></audio>`;
  assert.strictEqual(pickAudioUrl(html, PAGE), 'https://cdn.a.vn/x/bai-doc.mp3');
}

// 3. src tương đối → resolve theo trang bài. Trả về chuỗi thô thì <audio> phát
//    sai host (giống lỗi data-vid của Thanh Niên ở classifyVideo).
assert.strictEqual(pickAudioUrl(`<audio src="/audios/abc.mp3"></audio>`, PAGE), 'https://tienphong.vn/audios/abc.mp3');
assert.strictEqual(pickAudioUrl(`<audio src="//cdn.tienphong.vn/audios/abc.mp3"></audio>`, PAGE), 'https://cdn.tienphong.vn/audios/abc.mp3');

// 4. Lazyload: src thật nằm trong data-src.
assert.strictEqual(
  pickAudioUrl(`<audio preload="none" data-src="https://cdn.a.vn/x.mp3" src="data:audio/mpeg;base64,AAA"></audio>`, PAGE),
  'https://cdn.a.vn/x.mp3',
);

// 5. blob:/data: = player JS tự dựng, app không phát lại được → null, đừng trả
//    URL rác cho <audio> rồi hiện thanh nghe chết.
assert.strictEqual(pickAudioUrl(`<audio src="blob:https://a.vn/9f8e"></audio>`, PAGE), null);

// 6. HỒI QUY: bài có <video> nhưng KHÔNG có audio → không được nhận <source>
//    của video làm audio. Đây là cái bẫy của tempered token — bỏ `(?:(?!<\/audio>))`
//    là ca này trả về clip.mp4.
assert.strictEqual(
  pickAudioUrl(`<audio id="p" controls></audio><p>...</p><video><source src="https://cdn.a.vn/clip.mp4"></video>`, PAGE),
  null,
  'lôi <source> của <video> làm audio',
);

// 7. Bài không có audio → null (đa số báo).
assert.strictEqual(pickAudioUrl(`<p>Bài thường, chỉ có <img src="https://a.vn/x.jpg"></p>`, PAGE), null);

// 8. Audio đứng TRƯỚC video → vẫn lấy audio, không lấy video.
assert.strictEqual(
  pickAudioUrl(`<audio src="https://cdn.a.vn/doc.mp3"></audio><video><source src="https://cdn.a.vn/clip.mp4"></video>`, PAGE),
  'https://cdn.a.vn/doc.mp3',
);

console.log('audioSrc: 8 ca (1 ca thật Tiền Phong + 1 hồi quy video) — OK');
