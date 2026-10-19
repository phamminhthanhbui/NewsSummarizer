// AsyncStorage keys — centralized so callers don't magic-string

import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYS = {
  saved: '@saved_articles',
  history: '@summary_history',
  feedsCache: '@feeds_cache',       // cache RSS cho lần mở sau tức thì (stale-while-revalidate)
  feedsCacheTime: '@feeds_cache_time', // thời điểm ghi cache RSS — reload gần đây bỏ qua fetch lại
  voice: '@voice',          // giọng đọc cũ (expo-speech voice identifier)
  pitch: '@voice_pitch',
  rate: '@voice_rate',
  notifEnabled: '@notif_enabled', // bật/tắt bản tin hằng ngày (thông báo đẩy local)
  notifTimes: '@notif_times',     // mảng giờ gửi ["HH:MM", ...] — chọn nhiều khung giờ
  notifHour: '@notif_hour',       // (legacy — chỉ dùng để migrate sang notifTimes)
  notifMinute: '@notif_minute',
  readCounts: '@read_counts',      // { url: số lần mở } — nguồn thật cho "ĐỌC NHIỀU NHẤT"
} as const;

// Retired settings are only named here so upgrades can erase old credentials.
// Keep article history, saved articles, reading preferences and voice settings.
const RETIRED_SUMMARY_SETTINGS = [
  '@llm_provider', '@nim_key', '@nim_model', '@ai_unlocked',
  '@openai_key', '@anthropic_key', '@google_key', '@openrouter_key',
  '@custom_key', '@custom_base_url', '@bai_key',
];

export async function clearRetiredSummarySettings(): Promise<void> {
  await AsyncStorage.multiRemove(RETIRED_SUMMARY_SETTINGS);
}

// Storage limits — single source of truth for cache trimming
export const LIMITS = {
  savedMax: 100,
  historyMax: 50,
  descriptionMax: 200,
  relatedMax: 8,
  articleMinLength: 200,
  readCountsMax: 200,
} as const;

/* ─── Lượt đọc bài (nguồn cho section "ĐỌC NHIỀU NHẤT") ─── */

export type ReadCounts = Record<string, number>;

// App không có backend analytics → đếm ngay trên máy. Không có lượt đọc nào
// (máy mới, hoặc user chưa mở bài) là chuyện bình thường: trả {} và bên gọi
// tự sắp theo độ mới. Mọi lỗi đọc/ghi đều bị nuốt — đếm hỏng không được phép
// chặn việc mở bài.
export async function getReadCounts(): Promise<ReadCounts> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.readCounts);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function bumpReadCount(link: string): Promise<void> {
  try {
    const counts = await getReadCounts();
    counts[link] = (counts[link] || 0) + 1;
    const keys = Object.keys(counts);
    // ponytail: cắt tỉa khi vượt 1.5× trần, giữ top theo lượt đọc — đủ để chặn
    // phình vô hạn mà không cần LRU/thời điểm đọc.
    if (keys.length > LIMITS.readCountsMax * 1.5) {
      const kept: ReadCounts = {};
      for (const k of keys.sort((a, b) => counts[b] - counts[a]).slice(0, LIMITS.readCountsMax)) {
        kept[k] = counts[k];
      }
      await AsyncStorage.setItem(KEYS.readCounts, JSON.stringify(kept));
      return;
    }
    await AsyncStorage.setItem(KEYS.readCounts, JSON.stringify(counts));
  } catch { /* bỏ qua — xem getReadCounts */ }
}
