// Edge TTS (Microsoft) — free, no key, high-quality Vietnamese voice
// Chỉ dùng 1 giọng nam vi-VN-NamMinhNeural (giọng nữ đã bỏ: Web Speech local
// không đảm bảo có giọng nữ vi, vd Chrome chỉ có giọng nam "Microsoft An").

export const EDGE_VOICE = 'vi-VN-NamMinhNeural';

export async function speakEdge(text: string): Promise<string> {
  const voice = EDGE_VOICE;

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

// Warm cache TTS ngầm: summary vừa hiện là gọi /api/edge-tts ngay (fire-and-forget),
// proxy tổng hợp + ghi disk cache. User click Nghe sau đó = cache hit = tức thì,
// khỏi chờ 5-30s tổng hợp. Cùng text+voice với speakEdge nên key cache khớp.
// Lỗi thì im lặng — click Nghe vẫn fallback tổng hợp bình thường.
export function warmEdgeTts(text: string): void {
  const voice = EDGE_VOICE;
  const proxyUrl = process.env.EXPO_PUBLIC_PROXY_URL || (typeof window !== 'undefined' ? 'http://localhost:3001' : '');
  const endpoint = proxyUrl ? `${proxyUrl}/api/edge-tts` : '/api/edge-tts';
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  }).catch(() => {});
}

// Web Speech API: tên giọng vi khác nhau theo trình duyệt (Edge: "Microsoft NamMinh
// Neural"; Chrome thường chỉ có giọng nam "Microsoft An") và getVoices() trả [] ở lần
// gọi đầu (load async). Trả về giọng vi bất kỳ, hoặc null nếu trình duyệt KHÔNG CÓ
// giọng vi → caller tự fallback sang Edge TTS.
export async function resolveWebVoice(): Promise<SpeechSynthesisVoice | null> {
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
  return vi[0] || null;
}

// Web Speech có thể bị TREO ở một số browser (không kích hoạt onstart/onend/onerror).
// Ghi nhận để lần sau bỏ qua Web Speech, đi thẳng Edge TTS
// → không phải chờ resolveWebVoice + start-guard nữa (đọc nhanh hơn hẳn).
let webVoiceHung = false;
export function markWebVoiceHung() { webVoiceHung = true; }
export function isWebVoiceHung() { return webVoiceHung; }
// Reset mỗi lần BẮT ĐẦU bấm Nghe: mark cũ có thể oan (engine kẹt tạm thời)
// — reset để Web Speech được thử lại, khỏi rớt thẳng xuống Edge TTS chậm vĩnh viễn.
export function clearWebVoiceHung() { webVoiceHung = false; }

// Fallback: use expo-speech (system TTS, no network needed)
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