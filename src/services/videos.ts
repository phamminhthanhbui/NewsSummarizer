// Video crawl — app tự crawl thẳng từ trang video các báo, KHÔNG cần proxy PC.
// Cache AsyncStorage có TTL: mở lại app hiện video ngay nếu cache còn hạn,
// nếu quá hạn vẫn hiện cache cũ nhưng chờ crawl mới foreground (tối đa 10s).
// Cache mới luôn ghi đè, kể cả crawl thiếu source.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { VideoItem } from '../types';
import { KEYS } from '../services/storage';
import { orderedProxyBases, markProxyAlive, markProxyDead } from '../utils/proxy';
import { crawlAllVideos } from './videoCrawler';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút — video nổi bật theo xu hướng mới nhất

interface CacheEntry { ts: number; videos: VideoItem[]; }

async function readCache(): Promise<CacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.videosCache);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Backward compat: cache cũ là array
    return Array.isArray(parsed) ? { ts: 0, videos: parsed } : parsed;
  } catch { return null; }
}

function writeCache(entry: CacheEntry) {
  AsyncStorage.setItem(KEYS.videosCache, JSON.stringify(entry)).catch(() => {});
}

function proxyCandidates(): string[] {
  // orderedProxyBases: base sống đã biết đứng đầu, base chết bị backoff 3 phút
  const list = orderedProxyBases();
  return list.length ? list : ['http://localhost:3001'];
}

async function fetchViaProxy(): Promise<VideoItem[]> {
  const candidates = proxyCandidates();
  for (const base of candidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(base + '/api/videos', { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) { markProxyDead(base); continue; }
      markProxyAlive(base);
      const data = await res.json();
      if (Array.isArray(data.videos) && data.videos.length) return data.videos;
    } catch {
      markProxyDead(base);
    }
  }
  return [];
}

async function refresh(onFresh?: (v: VideoItem[]) => void): Promise<VideoItem[]> {
  if (Platform.OS === 'web') return fetchViaProxy();
  const direct = await crawlAllVideos(onFresh);
  if (direct.length) return direct;
  return fetchViaProxy();
}

export async function fetchVideos(onFresh?: (v: VideoItem[]) => void): Promise<VideoItem[]> {
  const entry = await readCache();
  const now = Date.now();
  const fresh = entry && (now - entry.ts) < CACHE_TTL_MS;

  // Có cache (kể cả HẾT HẠN): trả NGAY cache → video hiện tức thì lúc launch,
  // crawl nền cập nhật qua onFresh (partial từng nguồn + bản đầy đủ khi xong).
  // Trước đây cache hết hạn phải chờ crawl foreground tới 12s mới hiện video.
  if (entry && entry.videos.length) {
    refresh(onFresh).then((videos) => {
      if (videos.length) writeCache({ ts: Date.now(), videos });
      if (videos.length) onFresh?.(videos);
    }).catch(() => {});
    return entry.videos;
  }

  // Không cache (lần đầu mở app): crawl — nguồn nào xong trước onFresh push
  // partial lên UI ngay (video nổi bật hiện sau ~2-3s, không chờ cả 6 nguồn).
  const videos = await refresh(onFresh).catch(() => [] as VideoItem[]);
  if (videos.length) writeCache({ ts: Date.now(), videos });
  return videos;
}