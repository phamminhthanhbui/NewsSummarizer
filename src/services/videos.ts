// Video crawl — RSS không có video/live, phải parse trang video của báo.
// Server crawl (server/proxy.js /api/videos), client chỉ lấy JSON.
// CDN chặn phát trực tiếp (mp4 trả 400, hls.mediacdn.vn resolve IP private)
// nên bấm video = mở trang gốc trong browser.

import type { VideoItem } from '../types';

const PROXY_BASE = process.env.EXPO_PUBLIC_PROXY_URL || 'http://localhost:3001';

export async function fetchVideos(): Promise<VideoItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(PROXY_BASE + '/api/videos', { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.videos) ? data.videos : [];
  } catch {
    return [];
  }
}
