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
  voice: '@voice',          // giọng đọc cũ (expo-speech voice identifier)
  voiceGender: '@voice_gender', // Edge TTS gender: 'nam' | 'nu'
  pitch: '@voice_pitch',
  rate: '@voice_rate',
} as const;

// Storage limits — single source of truth for cache trimming
export const LIMITS = {
  savedMax: 100,
  historyMax: 50,
  descriptionMax: 200,
  relatedMax: 8,
  articleMinLength: 200,
} as const;
