// Video crawl — RSS không có video/live, phải parse trang video của báo.
// Server crawl (server/proxy.js /api/videos), client chỉ lấy JSON.
// VNExpress/Kenh14/Soha có stream (m3u8/mp4) → phát trong popup qua /api/hls
// proxy (CDN chặn browser gọi thẳng). Video crawl hụt stream → mở trang gốc.

import type { VideoItem } from '../types';
import { getProxyBase } from '../utils/proxy';

// localhost:3001 chỉ đúng trên PC/emulator. Điện thoại thật phải gọi proxy qua
// IP LAN của máy chạy metro — hostUri (vd "192.168.1.19:8087") mang IP đó.
// Thử lần lượt từng địa chỉ: cái nào sống thì dùng, chết thử cái tiếp.
function proxyCandidates(): string[] {
  const list = ['http://localhost:3001'];
  const base = getProxyBase();
  if (base !== 'http://localhost:3001') list.unshift(base);
  return list;
}

export async function fetchVideos(): Promise<VideoItem[]> {
  const candidates = proxyCandidates();
  console.log('[videos] thử:', candidates.join(', '));
  for (const base of candidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(base + '/api/videos', { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) { console.log('[videos]', base, '→ HTTP', res.status); continue; }
      const data = await res.json();
      if (Array.isArray(data.videos)) { console.log('[videos]', base, '→ OK', data.videos.length, 'video'); return data.videos; }
    } catch (e: any) {
      console.log('[videos]', base, '→ LỖI:', e?.message || e);
      // địa chỉ này chết — thử cái tiếp theo
    }
  }
  console.log('[videos] TẤT CẢ URL ĐỀU FAIL → section video ẩn');
  return [];
}
