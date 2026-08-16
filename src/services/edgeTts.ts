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

  // Upstream Edge TTS chập chờn → retry 2 lần nếu lỗi mạng hoặc 5xx
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    let retryable = true;
    try {
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
      lastErr = new Error(`Edge TTS error: ${res.status} ${errText}`);
      // 4xx (trừ 408/429) là lỗi request, retry vô ích
      retryable = !(res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
    if (!retryable) break;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw lastErr ?? new Error('Edge TTS failed');
}

export function revokeAudioUrl(url: string) {
  try { URL.revokeObjectURL(url); } catch {}
}

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