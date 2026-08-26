// Giọng đọc: ưu tiên expo-speech (thư viện RN, offline, không cần proxy/mạng);
// web dùng Web Speech API. KHÔNG còn Edge TTS (đã bỏ — app không phụ thuộc proxy).

// Web Speech API: tên giọng vi khác nhau theo trình duyệt (Edge: "Microsoft NamMinh
// Neural"; Chrome thường chỉ có giọng nam "Microsoft An") và getVoices() trả [] ở lần
// gọi đầu (load async). Trả về giọng vi bất kỳ, hoặc null nếu trình duyệt KHÔNG CÓ giọng vi.
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
// Ghi nhận để lần sau bỏ qua Web Speech → không phải chờ start-guard nữa (đọc nhanh hơn).
let webVoiceHung = false;
export function markWebVoiceHung() { webVoiceHung = true; }
export function isWebVoiceHung() { return webVoiceHung; }
// Reset mỗi lần BẮT ĐẦU bấm Nghe: mark cũ có thể oan (engine kẹt tạm thời)
// — reset để Web Speech được thử lại.
export function clearWebVoiceHung() { webVoiceHung = false; }

// expo-speech (system TTS, no network needed)
import * as Speech from 'expo-speech';

export type TTSOptions = {
  pitch?: number;
  rate?: number;
  voice?: string;
  // Word-boundary event (Android/iOS tuân thủ) — charIndex vị trí giọng đang đọc,
  // dùng để neo highlight đúng giọng thay vì nội suy thời gian.
  onBoundary?: (event: { charIndex: number }) => void;
};

export function speakSystem(text: string, options: TTSOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    Speech.speak(text, {
      language: 'vi-VN',
      pitch: options.pitch ?? 1.0,
      rate: options.rate ?? 1.0,
      voice: options.voice,
      onBoundary: options.onBoundary as any,
      onDone: () => resolve(),
      onError: (e) => reject(e),
      onStopped: () => resolve(),
    });
  });
}

export function stopSystem(): void {
  Speech.stop();
}
