// Trọng tâm (Focus) — mô hình trích xuất nội dung cốt lõi của bài báo.
// Dùng làm nguồn duy nhất cho: tóm tắt trọng tâm, gắn media, highlight.

import { extractJsonObject } from '../utils/json';
import type { LLMProvider } from './llm';

// ----- Types -----

export type FocusEntityType = 'person' | 'org' | 'place' | 'product' | 'number' | 'time' | 'other';

export interface FocusEntity {
  name: string;
  type: FocusEntityType;
}

export interface KeyPoint {
  point: string;       // ý chính, 1-2 câu
  importance: number;  // 0..1
  anchor?: string;     // section id (Phase 2)
}

// 5W1H — khung báo chí bắt LLM phải bám trọng tâm: mọi ý trong summary phải
// thuộc một khía cạnh này, không được lạc đề.
export interface FiveW1H {
  who: string;    // ai / tổ chức nào
  what: string;   // sự kiện gì
  when: string;   // khi nào
  where: string;  // ở đâu
  why: string;    // vì sao / nguyên nhân
  impact: string; // hệ quả / ý nghĩa
}

export interface FocusModel {
  thesis: string;          // trọng tâm cốt lõi, 1 câu
  keyPoints: KeyPoint[];   // ý chính, sắp xếp theo importance
  entities: FocusEntity[]; // thực thể cần giữ nguyên
  keywords: string[];      // từ khóa trọng tâm (cho highlight)
  fiveW1H?: FiveW1H;       // khung 5W1H (nếu LLM trả)
}

// Provider nào hỗ trợ response_format json_object (OpenAI-compatible)
const JSON_MODE_PROVIDERS = new Set<LLMProvider>(['openai', 'openrouter']);

// ----- Prompt -----

export function buildFocusPrompt(inputText: string, category?: string): string {
  const cat = category
    ? `\nLưu ý chuyên mục ${category}: tập trung vào nội dung trọng tâm của chuyên mục này.`
    : '';
  return `Bạn là biên tập viên tin tức. Đọc bài báo dưới đây và trả về ĐÚNG một đối tượng JSON (không markdown, không giải thích) theo cấu trúc:

{
  "thesis": "Trọng tâm cốt lõi của bài — đúng 1 câu, dưới 25 từ",
  "keyPoints": [
    {"point": "ý chính diễn đạt 1-2 câu", "importance": 0.9},
    {"point": "ý chính 2", "importance": 0.7}
  ],
  "entities": [
    {"name": "Tên thực thể", "type": "person|org|place|product|number|time|other"}
  ],
  "keywords": ["từ khóa trọng tâm", "..."]
}

Quy tắc:
- thesis = một câu duy nhất nêu ĐÚNG trọng tâm bài (ai, cái gì, hệ quả gì).
- keyPoints: 3-6 ý, mỗi ý kèm importance (0..1). Chỉ giữ ý THẬT SỰ quan trọng; bỏ chi tiết phụ, quảng cáo, khuyến nghị chung.
- entities: thực thể quan trọng (tên người/tổ chức/nơi chốn/sản phẩm/số liệu/thời gian) — giữ nguyên chính tả.
- keywords: 4-8 từ khóa ngắn gọn, mỗi từ 2-5 từ, phản ánh chủ đề cốt lõi.
- Chỉ dùng thông tin CÓ trong bài; KHÔNG bịa.${cat}

Bài báo:
${inputText}`;
}

// ----- Section-aware truncation -----

export function truncateSectionAware(text: string, maxChars = 5000): string {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const total = paras.reduce((s, p) => s + p.length, 0);
  if (total <= maxChars) return text;

  const out: string[] = [];
  let used = 0;

  // Mở đầu: 25% số đoạn đầy đủ (chứa thesis)
  const introCount = Math.max(1, Math.floor(paras.length * 0.25));
  for (let i = 0; i < introCount && i < paras.length && used < maxChars; i++) {
    out.push(paras[i]);
    used += paras[i].length;
  }

  // Đoạn giữa: chỉ lấy câu đầu tiên mỗi đoạn
  for (let i = introCount; i < paras.length - 1 && used < maxChars; i++) {
    const first = paras[i].split(/(?<=[.!?…])\s+/)[0];
    if (used + first.length > maxChars) break;
    out.push(first + '…');
    used += first.length + 1;
  }

  // Kết luận: đoạn cuối (chứa kết quả/kết luận)
  const last = paras[paras.length - 1];
  if (used + last.length <= maxChars) {
    out.push(last);
  } else {
    out.push(last.slice(0, Math.max(40, maxChars - used)) + '…');
  }

  return out.join('\n\n') + '\n\n…(đã cắt để giữ trọng tâm)';
}

// ----- Normalize LLM output -----

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

const VALID_ENTITY_TYPES = new Set<FocusEntityType>(['person', 'org', 'place', 'product', 'number', 'time', 'other']);

function normalizeEntityType(t: string): FocusEntityType {
  const lower = t.toLowerCase();
  if (lower === 'person' || lower === 'people') return 'person';
  if (lower === 'org' || lower === 'organization' || lower === 'organization') return 'org';
  if (lower === 'place' || lower === 'location') return 'place';
  if (lower === 'product') return 'product';
  if (lower === 'number' || lower === 'numeric' || lower === 'number') return 'number';
  if (lower === 'time' || lower === 'date' || lower === 'datetime') return 'time';
  return 'other';
}

export function normalizeFocusObject(obj: any): FocusModel {
  const thesis = typeof obj?.thesis === 'string' ? obj.thesis.trim() : '';
  const keyPoints = Array.isArray(obj?.keyPoints)
    ? obj.keyPoints
        .filter((kp: any) => kp && typeof kp === 'object' && typeof kp.point === 'string' && kp.point.trim())
        .map((kp: any) => ({
          point: kp.point.trim(),
          importance: clamp01(Number(kp.importance) || 0.5),
          ...(typeof kp.anchor === 'string' && kp.anchor ? { anchor: kp.anchor } : {}),
        }))
        .sort((a: KeyPoint, b: KeyPoint) => b.importance - a.importance)
    : [];
  const entities = Array.isArray(obj?.entities)
    ? obj.entities
        .filter((e: any) => e && (typeof e === 'string' ? e.trim() : typeof e.name === 'string' && e.name.trim()))
        .map((e: any) => {
          if (typeof e === 'string') return { name: e.trim(), type: 'other' as FocusEntityType };
          return { name: e.name.trim(), type: normalizeEntityType(e.type) };
        })
    : [];
  const keywords = Array.isArray(obj?.keywords)
    ? obj.keywords.filter((k: any) => typeof k === 'string' && k.trim()).map((k: string) => k.trim()).slice(0, 12)
    : [];

  // 5W1H — optional, LLM không trả vẫn OK
  let fiveW1H: FiveW1H | undefined;
  if (obj?.fiveW1H && typeof obj.fiveW1H === 'object') {
    const w = obj.fiveW1H;
    const str = (v: any) => typeof v === 'string' ? v.trim() : '';
    const w5: FiveW1H = { who: str(w.who), what: str(w.what), when: str(w.when), where: str(w.where), why: str(w.why), impact: str(w.impact) };
    if (w5.who || w5.what || w5.when || w5.where || w5.why || w5.impact) fiveW1H = w5;
  }

  if (!thesis && !keyPoints.length) throw new Error('AI không trả về đúng định dạng trọng tâm');
  return { thesis, keyPoints: keyPoints.slice(0, 8), entities: entities.slice(0, 10), keywords, fiveW1H };
}

export function normalizeFocusOutput(raw: string): FocusModel {
  const obj = extractJsonObject(raw);
  if (!obj) throw new Error('AI không trả về đúng định dạng trọng tâm');
  return normalizeFocusObject(obj);
}

// ----- LLM call -----
// Dùng dynamic import để focus.ts không kéo react-native/llm vào top-level —
// các hàm thuần (normalize/heuristic/truncate) chạy được dưới node (tự test).

export async function extractFocus(
  articleText: string,
  provider: LLMProvider,
  apiKey: string,
  model: string,
  customBaseUrl?: string,
  category?: string,
): Promise<FocusModel> {
  const { getProviderConfig, buildLlmRequest, sendLlmRequest } = await import('./llm');
  const cfg = getProviderConfig(provider);
  if (!cfg) throw new Error('Dịch vụ AI tạm thời không khả dụng, thử lại sau');

  const inputText = truncateSectionAware(articleText);
  const system = buildFocusPrompt(inputText, category);
  const user = `Bài báo:\n\n${inputText}`;
  const jsonMode = JSON_MODE_PROVIDERS.has(provider);

  const { url, headers, body } = buildLlmRequest(provider, apiKey, model, system, user, 700, customBaseUrl, { jsonMode });
  const data = await sendLlmRequest(url, headers, body, provider, cfg.label);
  const raw = provider === 'anthropic' ? data.content?.[0]?.text || '' : data.choices?.[0]?.message?.content || '';
  return normalizeFocusOutput(raw);
}

// ----- Heuristic fallback (không cần AI) -----

const VI_STOPWORDS = new Set([
  'của', 'và', 'là', 'có', 'trong', 'cho', 'được', 'với', 'các', 'như',
  'để', 'từ', 'theo', 'không', 'một', 'này', 'đã', 'sẽ', 'đang', 'bởi',
  'khi', 'nếu', 'về', 'ra', 'lên', 'xuống', 'tại', 'sau', 'trước', 'nhưng',
  'hay', 'hoặc', 'thì', 'vì', 'đó', 'nên', 'còn', 'đến', 'vào', 'người',
  'việt', 'nam', 'qua', 'lại', 'rất', 'nhiều', 'mới', 'cũ', 'nhất',
]);

function focusTokenize(s: string): string[] {
  return s.toLowerCase().split(/\s+/)
    .map((w) => w.replace(/[.,!?…:;"'()%\-/]/g, ''))
    .filter((w) => w.length >= 4 && !VI_STOPWORDS.has(w));
}

export function buildHeuristicFocus(title: string, text: string): FocusModel {
  const kw = focusTokenize(title);
  const freq = new Map<string, number>();
  for (const w of focusTokenize(text.slice(0, 6000))) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const freqKeywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);
  const keywords = [...new Set([...kw, ...freqKeywords])].slice(0, 12);

  // Thesis = câu đầu tiên ≥ 25 ký tự
  const sentences = text.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter((s) => s.length >= 25);
  const thesis = sentences[0] || text.slice(0, 100);

  // KeyPoints: câu có chồng lấn từ khóa cao nhất với title
  const cands = sentences.map((s, i) => {
    const words = focusTokenize(s);
    let hits = 0;
    for (const w of words) if (kw.includes(w)) hits++;
    return { s, hits, i, imp: Math.min(1, 0.4 + hits * 0.15 + (i === 0 ? 0.1 : 0)) };
  }).filter((c) => c.hits > 0).sort((a, b) => b.hits - a.hits);

  let keyPoints = cands.sort((a, b) => a.i - b.i).map((c) => ({
    point: c.s,
    importance: Math.round(clamp01(c.imp) * 10) / 10,
  }));
  if (!keyPoints.length) keyPoints = [{ point: thesis, importance: 1 }];

  // Entities: từ khóa title + token số
  const numbers = [...new Set((text.match(/\d[\d.,%]*/g) || []).slice(0, 4))];
  const entities: FocusEntity[] = [
    ...kw.map((w) => ({ name: w, type: 'other' as FocusEntityType })),
    ...numbers.map((n) => ({ name: n, type: 'number' as FocusEntityType })),
  ].slice(0, 10);

  return { thesis, keyPoints: keyPoints.slice(0, 6), entities, keywords: keywords.slice(0, 8) };
}

// ----- Render fallback summary từ focus (khi LLM pass 2 thất bại) -----

export function focusToTextSummary(focus: FocusModel): string {
  const lines: string[] = [];
  if (focus.thesis) lines.push(focus.thesis);
  const pts = [...focus.keyPoints].sort((a, b) => b.importance - a.importance);
  for (const p of pts.slice(0, 5)) lines.push(p.point);
  return lines.join('\n\n');
}