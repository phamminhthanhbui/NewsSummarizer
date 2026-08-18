// Edge TTS (Microsoft) — free, no key, high-quality Vietnamese voices
// Voice list: https://speech.microsoft.com/portal/voicegallery
// VN voices: vi-VN-HoaiMyNeural (female), vi-VN-NamMinhNeural (male)

export const EDGE_VOICES = {
  nu: 'vi-VN-HoaiMyNeural',
  nam: 'vi-VN-NamMinhNeural',
} as const;

export type EdgeGender = keyof typeof EDGE_VOICES;

export async function speakEdge(text: string, gender: EdgeGender): Promise<string> {
  const voice = EDGE_VOICES[gender];

  // Use local proxy server (server/proxy.js) or deployed endpoint
  // Configure via EXPO_PUBLIC_PROXY_URL env var or default to localhost
  const proxyUrl = process.env.EXPO_PUBLIC_PROXY_URL || (typeof window !== 'undefined' ? 'http://localhost:3001' : '');
  const endpoint = proxyUrl ? `${proxyUrl}/api/edge-tts` : '/api/edge-tts';

  // KHÔNG retry phía client: proxy (server/proxy.js) đã retry 3 lần với backoff.
  // Client retry thêm = 3×3 = tối đa 9 lần tổng hợp, mỗi lần cold 7-15s → chờ 15-20s+.
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });
  if (res.ok) {
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }
  const errText = await res.text().catch(() => '');
  throw new Error(`Edge TTS lỗi: ${res.status} ${errText}`);
}

export function revokeAudioUrl(url: string) {
  try { URL.revokeObjectURL(url); } catch {}
}

// Web Speech API: tên giọng vi khác nhau theo trình duyệt (Edge: "Microsoft HoaiMy Neural"
// nữ / "Microsoft NamMinh Neural" nam; Chrome thường chỉ có 1 giọng nam) và getVoices()
// trả [] ở lần gọi đầu (load async). Trả về giọng khớp gender, hoặc null nếu trình duyệt
// KHÔNG CÓ giọng đó → caller tự fallback sang Edge TTS (đảm bảo đúng giọng đã chọn).
export async function resolveWebVoice(gender: EdgeGender): Promise<SpeechSynthesisVoice | null> {
  if (typeof speechSynthesis === 'undefined') return null;
  const voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const list = speechSynthesis.getVoices();
    if (list.length) return resolve(list);
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(speechSynthesis.getVoices()); } };
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1000);
  });
  const vi = voices.filter((v) => v.lang.toLowerCase().startsWith('vi'));
  const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/);
  const FEMALE = ['hoaomy', 'lan'];
  const MALE = ['namminh', 'an'];
  const hints = gender === 'nam' ? MALE : FEMALE;
  return vi.find((v) => tokens(v.name).some((t) => hints.includes(t))) || null;
}

// Web Speech có thể CÓ giọng khớp gender nhưng bị TREO ở một số browser
// (không kích hoạt onstart/onend/onerror, vd giọng nữ cloud trên Edge).
// Ghi nhận giọng đã treo để lần sau bỏ qua Web Speech, đi thẳng Edge TTS
// → không phải chờ resolveWebVoice + start-guard nữa (đọc nhanh hơn hẳn).
const hungWebVoices = new Set<EdgeGender>();
export function markWebVoiceHung(gender: EdgeGender) { hungWebVoices.add(gender); }
export function isWebVoiceHung(gender: EdgeGender) { return hungWebVoices.has(gender); }

// Fallback: use expo-speech (system TTS, no network needed)
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

export type TTSOptions = {
  pitch?: number;
  rate?: number;
  voice?: string;
};

export function speakSystem(text: string, options: TTSOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    Speech.speak(text, {
      language: 'vi-VN',
      pitch: options.pitch ?? 1.0,
      rate: options.rate ?? 1.0,
      voice: options.voice,
      onDone: () => resolve(),
      onError: (e) => reject(e),
      onStopped: () => resolve(),
    });
  });
}

export function stopSystem(): void {
  Speech.stop();
}