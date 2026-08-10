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
  const res = await fetch('/api/edge-tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Edge TTS error: ${res.status} ${err}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function revokeAudioUrl(url: string) {
  try { URL.revokeObjectURL(url); } catch {}
}