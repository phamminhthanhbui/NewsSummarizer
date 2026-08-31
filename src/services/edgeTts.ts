// Giọng đọc: expo-speech cho CẢ web lẫn native — bản web của expo-speech bọc
// sẵn Web Speech API (speechSynthesis), hỗ trợ cả onBoundary cho highlight.
// KHÔNG còn Edge TTS, KHÔNG còn hook Web Speech tự viết.
//
// Các guard bù lại những gì expo-speech thuần KHÔNG xử lý được trên web
// (trình duyệt mới là nguồn lỗi; native ổn định nên không cần guard):
//   1. Danh sách voices load CHẬM hoặc không bao giờ load (getVoices trả []
//      lúc mới mở trang, một số browser không bắn voiceschanged) → resolve
//      giọng vi tường minh qua getAvailableVoicesAsync + timeout 1.5s; không
//      có giọng vi → báo lỗi rõ ràng thay vì đọc kiểu "gà mờ".
//   2. Giọng TREO: không fire onstart/onend/onerror → promise treo vĩnh viễn,
//      nút kẹt "Dừng". Start-guard: quá hạn không onstart → hủy + mark để
//      lần sau fail fast (giọng hoạt động onstart <300ms).
//   3. Queue kẹt: utterance cũ treo thì utterance mới KHÔNG BAO GIỜ chạy →
//      stop() xả queue trước khi speak; Chrome/Edge có race cancel→speak
//      (speak ngay sau cancel bị nuốt) nên phải đợi ~120ms giữa 2 lệnh.
//   4. Bấm Dừng trên web → utterance fire onerror(canceled) thay vì onend →
//      speakToken phân biệt lỗi thật với lỗi do chủ động cancel.
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

export type TTSOptions = {
  pitch?: number;
  rate?: number;
  voice?: string;
  // Giọng THỰC SỰ bắt đầu phát (sau độ trễ khởi động engine/queue) — caller
  // dùng làm mốc thời gian cho nội suy highlight, không tính độ trễ này.
  onStart?: () => void;
  // Word-boundary event (web + Android tuân thủ) — charIndex vị trí giọng đang
  // đọc, dùng để neo highlight đúng giọng thay vì nội suy thời gian.
  onBoundary?: (event: { charIndex: number }) => void;
};

// Token nhận diện lượt speak: stopSystem() tăng token → các callback muộn của
// lượt CŨ được coi là hủy, không phải lỗi.
let speakToken = 0;

// Giọng treo gần đây (timestamp) — fail fast thay vì chờ guard mỗi lần bấm.
let voiceHungAt = 0;
const VOICE_HUNG_COOLDOWN_MS = 5 * 60 * 1000;

// Web Speech không fire onstart trong khoảng này = giọng treo (giọng hoạt động
// kích hoạt onstart gần như tức thì; 1.5s đủ dư cho máy chậm).
const START_GUARD_MS = 1500;

// Voices không load kịp trong khoảng này → bỏ resolve giọng, đọc theo lang.
const VOICES_LOAD_TIMEOUT_MS = 1500;

export function markVoiceHung(): void {
  voiceHungAt = Date.now();
}

export function isVoiceHung(): boolean {
  return Date.now() - voiceHungAt < VOICE_HUNG_COOLDOWN_MS;
}

// Reset mỗi lần BẮT ĐẦU bấm Nghe: mark cũ có thể oan (engine kẹt tạm thời).
export function clearVoiceHung(): void {
  voiceHungAt = 0;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function stopSystem(): void {
  speakToken++;
  Speech.stop();
}

// Web: chọn giọng vi tường minh. Trả về voiceURI, hoặc undefined nếu danh sách
// voices không load kịp (fallback: browser tự chọn theo lang 'vi-VN').
async function resolveWebVoiceURI(): Promise<string | undefined> {
  let timedOut = false;
  const voices = await Promise.race([
    Speech.getAvailableVoicesAsync(),
    delay(VOICES_LOAD_TIMEOUT_MS).then(() => {
      timedOut = true;
      return null;
    }),
  ]);
  if (timedOut) return undefined;
  const vi = (voices || []).find((v) => (v.language || '').toLowerCase().startsWith('vi'));
  if (!vi) throw new Error('Trình duyệt không có giọng đọc tiếng Việt');
  // expo-speech web map voiceURI → SpeechSynthesisVoice (Voice là WebVoice trên web)
  return (vi as any).voiceURI || vi.identifier;
}

export async function speakSystem(text: string, options: TTSOptions = {}): Promise<void> {
  const isWeb = Platform.OS === 'web';
  const token = speakToken;

  if (isWeb) {
    // Giọng vừa treo gần đây → fail fast ngay, khỏi chờ guard treo thêm lần nữa.
    if (isVoiceHung()) throw new Error('Giọng đọc trên trình duyệt đang lỗi, hãy thử lại sau');

    let voice: string | undefined;
    try {
      voice = await resolveWebVoiceURI();
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Trình duyệt')) throw e;
      // Lỗi khác khi lấy voices (không load kịp...) → vẫn đọc theo lang
      voice = undefined;
    }
    if (token !== speakToken) return; // đã bị stop trong lúc resolve voices

    // Xả queue trước khi speak — utterance cũ treo/kẹt sẽ nuốt utterance mới
    // (bấm đọc im lặng). Đợi ngắn tránh race cancel→speak của Chrome/Edge.
    Speech.stop();
    await delay(120);
    if (token !== speakToken) return; // đã bị stop trong lúc chờ

    await new Promise<void>((resolve, reject) => {
      let started = false;
      let settled = false;
      let guard: ReturnType<typeof setTimeout> | null = null;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (guard) clearTimeout(guard);
        fn();
      };
      // Start-guard: không onstart trong window = giọng TREO → hủy + mark +
      // reject để caller báo lỗi, thay vì treo promise vĩnh viễn.
      guard = setTimeout(() => {
        if (started || settled) return;
        markVoiceHung();
        Speech.stop();
        finish(() => reject(new Error('Giọng đọc không phản hồi, hãy thử lại')));
      }, START_GUARD_MS);
      Speech.speak(text, {
        language: 'vi-VN',
        pitch: options.pitch ?? 1.0,
        rate: options.rate ?? 1.0,
        voice,
        onStart: () => {
          started = true;
          if (guard) clearTimeout(guard);
          options.onStart?.();
        },
        onBoundary: options.onBoundary as any,
        onDone: () => finish(resolve),
        onStopped: () => finish(resolve),
        onError: () => {
          // token lệch = do stopSystem() hủy — không phải lỗi
          if (token !== speakToken) {
            finish(resolve);
            return;
          }
          finish(() => reject(new Error('Không đọc được giọng Việt trên thiết bị này')));
        },
      });
    });
    return;
  }

  // Native: gọi thẳng, không guard.
  await new Promise<void>((resolve, reject) => {
    Speech.speak(text, {
      language: 'vi-VN',
      pitch: options.pitch ?? 1.0,
      rate: options.rate ?? 1.0,
      voice: options.voice,
      onStart: options.onStart,
      onBoundary: options.onBoundary as any,
      onDone: () => resolve(),
      onError: () => {
        if (token !== speakToken) {
          resolve(); // bị stopSystem() hủy — không phải lỗi
          return;
        }
        reject(new Error('Không đọc được giọng Việt trên thiết bị này'));
      },
      onStopped: () => resolve(),
    });
  });
}
