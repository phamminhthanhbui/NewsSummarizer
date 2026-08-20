// Video crawl — RSS không có video/live, phải parse trang video của báo.
// Server crawl (server/proxy.js /api/videos), client chỉ lấy JSON.
// CDN chặn phát trực tiếp (mp4 trả 400, hls.mediacdn.vn resolve IP private)
// nên bấm video = mở trang gốc trong browser.

import Constants from 'expo-constants';
import type { VideoItem } from '../types';

// localhost:3001 chỉ đúng trên PC/emulator. Điện thoại thật phải gọi proxy qua
// IP LAN của máy chạy metro — hostUri (vd "192.168.1.19:8087") mang IP đó.
// Thử lần lượt từng địa chỉ: cái nào sống thì dùng, chết thử cái tiếp.
function proxyCandidates(): string[] {
  if (process.env.EXPO_PUBLIC_PROXY_URL) return [process.env.EXPO_PUBLIC_PROXY_URL];
  const host = (Constants.expoConfig?.hostUri || '').split(':')[0];
  const list = ['http://localhost:3001'];
  if (host && host !== 'localhost') list.unshift(`http://${host}:3001`);
  return list;
}

export async function fetchVideos(): Promise<VideoItem[]> {
  const candidates = proxyCandidates();
  console.log('[videos] hostUri =', Constants.expoConfig?.hostUri, '| thử:', candidates.join(', '));
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
