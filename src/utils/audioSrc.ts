// Audio của TÒA SOẠN — bản đọc toàn bài do chính báo làm (Tiền Phong: mỗi bài
// thể thao có 1 file podcast.mp3 trong <div class="podcast-player">).
//
// Trang họ thường ẨN thẻ này (`style="visibility:hidden; width:0; height:0"`)
// vì nút play hiển thị là JS riêng — thẻ <audio> chỉ là động cơ phía sau. Ẩn
// nhưng src vẫn là audio thật, lấy thẳng được, không cần chạy JS của họ.
//
// ponytail: nhận `src` trần, `data-src` (lazyload) và `<source src>` con. Báo
// nào nhét audio vào blob:/MediaSource do JS tự dựng thì chịu — cần trình duyệt
// thật, không đáng.

// Trong THẺ <audio> — `[^>]*?` không vượt qua `>` nên không lôi src của tag khác.
const AUDIO_TAG_RE = /<audio\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i;

// <audio> không có src, src nằm ở <source> con. Tempered token
// `(?:(?!<\/audio>)[\s\S])*?` để KHÔNG quét lố sang <source> của một <video>
// đứng sau (bài có cả audio lẫn video).
const AUDIO_SOURCE_RE = /<audio\b(?:(?!<\/audio>)[\s\S])*?<source\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i;

// URL audio đầu tiên dùng được trong HTML, đã resolve thành absolute.
// null = bài không có audio của tòa soạn.
export function pickAudioUrl(html: string, pageUrl: string): string | null {
  const m = AUDIO_TAG_RE.exec(html) ?? AUDIO_SOURCE_RE.exec(html);
  if (!m) return null;
  const raw = m[1].trim();
  // blob:/data: = JS của báo tự sinh lúc chạy → app không phát lại được.
  if (!raw || /^(?:blob|data):/i.test(raw)) return null;
  let u = raw.startsWith('//') ? 'https:' + raw : raw;
  try {
    // src tương đối (/audio/x.mp3) resolve theo trang bài — giống articlePathDiffers.
    u = new URL(u, pageUrl).href;
  } catch {
    return null;
  }
  return /^https?:/i.test(u) ? u : null;
}
