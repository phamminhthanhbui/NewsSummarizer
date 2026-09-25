// AsyncStorage keys — centralized so callers don't magic-string

export const KEYS = {
  provider: '@llm_provider',
  apiKey: '@nim_key',
  openaiKey: '@openai_key',
  anthropicKey: '@anthropic_key',
  googleKey: '@google_key',
  openrouterKey: '@openrouter_key',
  customKey: '@custom_key',
  customBaseUrl: '@custom_base_url',
  model: '@nim_model',
  saved: '@saved_articles',
  history: '@summary_history',
  feedsCache: '@feeds_cache',       // cache RSS cho lần mở sau tức thì (stale-while-revalidate)
  feedsCacheTime: '@feeds_cache_time', // thời điểm ghi cache RSS — reload gần đây bỏ qua fetch lại
  voice: '@voice',          // giọng đọc cũ (expo-speech voice identifier)
  pitch: '@voice_pitch',
  rate: '@voice_rate',
  aiUnlocked: '@ai_unlocked', // mã 016527 ở ô tìm kiếm home → hiện/ẩn mục AI trong Settings
  notifEnabled: '@notif_enabled', // bật/tắt bản tin hằng ngày (thông báo đẩy local)
  notifTimes: '@notif_times',     // mảng giờ gửi ["HH:MM", ...] — chọn nhiều khung giờ
  notifHour: '@notif_hour',       // (legacy — chỉ dùng để migrate sang notifTimes)
  notifMinute: '@notif_minute',
} as const;

// Storage limits — single source of truth for cache trimming
export const LIMITS = {
  savedMax: 100,
  historyMax: 50,
  descriptionMax: 200,
  relatedMax: 8,
  articleMinLength: 200,
} as const;
