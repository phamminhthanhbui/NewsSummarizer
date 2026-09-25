// NVIDIA NIM — OpenAI-compatible requests, streaming and model fallback.

import { Platform } from 'react-native';
import { KEYS } from './storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProxyBase, orderedProxyBases, markProxyDead, markProxyAlive, proxiedFetchText } from '../utils/proxy';
import { runCpuTask } from '../utils/parseQueue';
import type { FeedItem, SummaryRecord } from '../types';

export type LLMProvider = 'nvidia';

// NVIDIA NIM — app chạy được ngay khi start, không cần vào Settings nhập key.
// User nhập key khác trong Settings sẽ ghi đè (AsyncStorage ưu tiên hơn).
export const DEFAULT_NVIDIA_KEY = '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';

export interface ProviderConfig {
  id: LLMProvider;
  label: string;
  baseUrl: string;
  models: { id: string; label: string; power?: number }[];
  needsKey: boolean;
  keyStorageKey: keyof typeof KEYS;
  // For custom: user provides baseUrl
  supportsCustomUrl?: boolean;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    // Thứ tự mảng = thứ tự hiển thị trong dropdown, và models[0] là model MẶC ĐỊNH
    // (SettingsScreen lấy models[0].id). Còn chuỗi fallback thì xếp theo `power` giảm dần.
    models: [
      { id: 'nvidia/nemotron-3-super-120b-a12b', label: 'Nemotron 3 Super 120B (mạnh, miễn phí)', power: 6 },
      { id: 'deepseek-ai/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash (nhanh, miễn phí)', power: 5 },
      { id: 'nvidia/ising-calibration-1.5-31b', label: 'Ising Calibration 31B (nhanh, miễn phí)', power: 4 },
      { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', label: 'Nemotron 3.5 Lightning 30B (nhanh, miễn phí)', power: 3 },
      // ĐÃ LOẠI — đo thực tế 22/9/2026 bằng 6 vòng probe (luôn kèm 1 model đối chứng đã biết-tốt):
      // - deepseek-ai/deepseek-v4-pro-0813, minimaxai/minimax-m3 → 410 Gone, NIM đã EOL.
      // - google/gemma-4-31b-it, moonshotai/kimi-k3, mistralai/mistral-nemotron, z-ai/glm-5.3
      //   → timeout 8-9/9 lần thử trong 4 phiên, kể cả lúc nền tảng đã hết nghẽn ⇒ hỏng thật.
      // - openai/gpt-oss-20b, meta/muse-glimmer-30b, z-ai/glm-5.3-flash
      //   → 200 nhưng content RỖNG, chỉ có reasoning_content; app chỉ đọc message.content
      //     nên tóm tắt ra chuỗi rỗng (lỗi im lặng — nguy hiểm hơn lỗi ồn ào).
      // - poolside/laguna-xs-2.1, nvidia/nemotron-3-nano-omni-30b-a3b-reasoning
      //   → 400 khi app gửi thinking:{type:'disabled'} (model bắt buộc có reasoning).
      // - writer/palmyra-*, 01-ai/yi-large, và nhiều model cũ (llama-3.1/3.3, gemma-2b/3-*,
      //   mistral-*, mixtral, phi-3.5-moe, granite-3.0-8b, sea-lion-7b, jamba, dbrx, zamba2,
      //   kimi-k2.6, llama3-chatqa, nemotron-4-340b, nemotron-nano-3-30b)
      //   → 404 "Not found for account" (tài khoản không có quyền).
      // - nvidia/nemotron-3-ultra-550b-a55b → 200 nhưng là model enterprise, rủi ro tốn phí → loại.
      //
      // LƯU Ý KHI KIỂM TRA LẠI: NIM free tier nghẽn theo từng đợt (503 "Service temporarily
      // overloaded", timeout hàng loạt). Probe PHẢI chạy tuần tự và PHẢI kèm 1 model đối chứng
      // đã biết-tốt — nếu chính đối chứng fail thì đang nghẽn, đừng kết luận model hỏng.
      // Chỉ tin các lỗi tất định: 410 (EOL), 404 (không có quyền), 400 (sai request shape).
    ],
    needsKey: true,
    keyStorageKey: 'apiKey',
  },
];

export function getProviderConfig(provider: LLMProvider): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === provider);
}

export function getModelsForProvider(provider: LLMProvider): { id: string; label: string; power?: number }[] {
  return getProviderConfig(provider)?.models || [];
}

// Legacy export for backward compat
export const NIM_MODELS = getModelsForProvider('nvidia');

// Dựng request theo từng provider (endpoint + kiểu auth khác nhau)
export function buildLlmRequest(
  provider: LLMProvider,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  maxTokens: number,
  customBaseUrl?: string,
): { url: string; headers: Record<string, string>; body: any } {
  const cfg = getProviderConfig(provider);
  if (!cfg) throw new Error('Dịch vụ AI tạm thời không khả dụng, thử lại sau');

  const baseUrl = cfg.baseUrl;
  if (!baseUrl) throw new Error('Dịch vụ AI tạm thời không khả dụng, thử lại sau');

  // NVIDIA NIM là OpenAI-compatible /chat/completions
  const url = `${baseUrl}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  const body: any = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
  };
  // NVIDIA có model reasoning — tắt thinking để trả summary trực tiếp (không tiêu
  // token/độ trễ vào chuỗi suy luận, content luôn có nội dung). Model không hỗ trợ
  // thì NIM bỏ qua field này.
  body.thinking = { type: 'disabled' };
  return { url, headers, body };
}

// Gửi request — web đi qua proxy local (server/proxy.js) khi provider không có CORS.
// Failover qua các candidate base (cùng origin → IP Metro → loopback), mỗi base một
// attempt với header-timeout riêng: base chết (IP cũ/firewall) không chặn base sau.
// timeoutMs chỉ dùng cho test kết nối; summarize không đặt (bài dài có thể chậm).
export async function sendLlmRequest(
  url: string,
  headers: Record<string, string>,
  body: any,
  provider: LLMProvider,
  label: string,
  timeoutMs?: number,
  onToken?: (partial: string) => void,
): Promise<any> {
  const isWeb = Platform.OS === 'web';

  // NVIDIA trên web đi qua proxy; native gọi trực tiếp.
  // Danh sách base đã sắp theo sức khỏe (base sống đầu tiên).
  const proxyBases = isWeb ? orderedProxyBases() : [''];
  if (!proxyBases.length) {
    throw new Error('Dịch vụ AI không kết nối được, kiểm tra mạng và thử lại');
  }

  let lastError: Error = new Error('Dịch vụ AI không kết nối được, kiểm tra mạng và thử lại');
  for (const base of proxyBases) {
    const corsProxy = base ? `${base}/api/llm` : undefined;
    const finalUrl = corsProxy || url;
    const finalHeaders = corsProxy
      ? { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      : headers;
    const finalBody = corsProxy
      ? JSON.stringify({ url, method: 'POST', body, headers })
      : JSON.stringify(body);

    // Attempt timer CHỈ tồn tại khi caller truyền timeoutMs (test kết nối).
    // Summarize thật KHÔNG có timer: proxy /api/llm chỉ trả response SAU KHI
    // LLM chạy xong (thường 15-40s) — timer ngắn sẽ giết nhầm request khỏe
    // rồi đánh dấu OAN base đang sống là chết (lỗi đã gặp).
    const controller = new AbortController();
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(finalUrl, {
        method: 'POST',
        headers: finalHeaders,
        body: finalBody,
        signal: controller.signal,
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) {
        // Proxy chết/treo ở tầng server → thử base kế; lỗi từ LLM upstream là
        // nghiệp vụ → báo ngay, không retry base khác.
        if (corsProxy && (res.status === 404 || res.status >= 500)) {
          markProxyDead(base);
          lastError = new Error(`Dịch vụ AI tạm thời lỗi (HTTP ${res.status})`);
          continue;
        }
        const err = await res.json().catch(() => ({}));
        const msg = (err as any)?.error?.message || (err as any)?.message || `HTTP ${res.status}`;
        throw new Error(`Dịch vụ AI tạm thời lỗi (${msg})`);
      }
      if (corsProxy) markProxyAlive(base);
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('event-stream')) {
        // Stream thật sự (web): đọc từng chunk, onToken vẽ dần.
        if (onToken && res.body && typeof (res.body as any).getReader === 'function') {
          const content = await readSseContent(res, onToken);
          return { choices: [{ message: { content } }] };
        }
        // Native / không hỗ trợ reader → đọc trọn body text rồi parse SSE 1 lần.
        const raw = await res.text();
        const content = raw.split('\n').reduce((acc, line) => {
          const l = line.trim();
          if (!l.startsWith('data:')) return acc;
          const payload = l.slice(5).trim();
          if (!payload || payload === '[DONE]') return acc;
          try {
            const j = JSON.parse(payload);
            return acc + (j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.text ?? '');
          } catch { return acc; }
        }, '');
        onToken?.(content);
        return { choices: [{ message: { content } }] };
      }
      return await res.json();
    } catch (e) {
      if (timer) clearTimeout(timer);
      const msg = e instanceof Error ? e.message : '';
      if (/^Dịch vụ AI/.test(msg)) throw e;
      if ((e as any)?.name === 'AbortError') {
        // Chỉ xảy ra ở nhánh test kết nối (summarize không còn timer)
        lastError = new Error('Dịch vụ AI phản hồi quá chậm, thử lại sau');
      } else {
        lastError = e instanceof Error ? e : lastError;
      }
      if (corsProxy) markProxyDead(base);
      continue;
    }
  }
  throw lastError;
}

// Đọc SSE (data: {json}\n\n ...) từ response, gom delta.content, gọi onToken
// cho phần text đã tích lũy (throttle ~100ms) để UI vẽ dần chữ.
async function readSseContent(res: Response, onToken: (acc: string) => void): Promise<string> {
  const reader = (res.body as any).getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const decoder = new TextDecoder();
  let buf = '';
  let acc = '';
  let lastCb = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const j = JSON.parse(payload);
        const delta = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.text ?? '';
        if (delta) {
          acc += delta;
          const now = Date.now();
          if (now - lastCb >= 100) { lastCb = now; onToken(acc); }
        }
      } catch { /* chunk chẵn lẻ chưa đủ JSON — chờ dòng sau */ }
    }
  }
  onToken(acc); // bản cuối trước khi normalize
  return acc;
}

// Gợi ý riêng theo chuyên mục — FeedItem đã mang category từ RSS
const CATEGORY_PROMPT_HINTS: Record<string, string> = {
  'Thể thao': 'Ưu tiên tỉ số, lượt đi/lượt về, tên cầu thủ và HLV liên quan.',
  'Kinh doanh': 'Ưu tiên số liệu tài chính, doanh thu, dự báo và kết luận thị trường.',
  'Công nghệ': 'Ưu tiên tên sản phẩm/thiết bị, thông số nổi bật và giá bán nếu có.',
  'Sức khỏe': 'Ưu tiên triệu chứng và khuyến cáo từ chuyên môn; KHÔNG đưa chẩn đoán hay cách chữa cụ thể.',
  'Giải trí': 'Ưu tiên tên nghệ sĩ, tác phẩm và sự kiện chính.',
};

// Core: summarize via NVIDIA NIM.
// Trả về summary CÓ CẤU TRÚC dạng văn bản thuần:
//   dòng 1        = TL;DR (1 câu)
//   các dòng giữa = ý chính (mỗi dòng 1 đoạn)
//   dòng "• ..."  = dữ kiện cụ thể (số liệu/tên/thời gian)
// ArticleScreen nhận diện qua bullet để style TL;DR + chip dữ kiện riêng.
export async function summarizeWithProvider(
  articleText: string,
  provider: LLMProvider,
  apiKey: string,
  model: string,
  customBaseUrl?: string,
  category?: string,
  onToken?: (partial: string) => void,
  attemptTimeoutMs?: number,
): Promise<string> {
  const hint = (category && CATEGORY_PROMPT_HINTS[category]) || '';
  const prompt = `Bạn là biên tập viên tin tức. Tóm tắt bài báo dưới đây bằng tiếng Việt, trả về ĐÚNG cấu trúc sau — không tiêu đề, không giải thích, không markdown:

Dòng 1: TL;DR — MỘT câu do BẠN TỰ VIẾT nêu trọng tâm bài (dưới 20 từ). KHÔNG được là chuyên mục, ngày giờ, tên báo, hay copy nguyên câu từ bài.
Tiếp theo: 3-4 dòng, mỗi dòng MỘT ý chính do BẠN TỔNG HỢP, bám trọng tâm (tiêu đề + đoạn đầu). Mỗi ý 1 câu văn xuôi. KHÔNG liệt kê từng chi tiết phụ, KHÔNG copy nguyên văn câu dài từ bài.
Cuối cùng: 2-3 dòng bắt đầu bằng "• " liệt kê DỮ KIỆN cụ thể (số liệu, tên riêng, thời gian, địa điểm). Chỉ lấy thông tin CÓ TRONG bài.

${hint ? `Lưu ý chuyên mục ${category}: ${hint}\n` : ''}Quy tắc: giữ nguyên số liệu/tên riêng/thời gian; KHÔNG bịa thông tin; KHÔNG đưa metadata (chuyên mục, ngày giờ đăng, tên tòa soạn, ghi chú ảnh "Ảnh: ..."); các dòng cách nhau bằng dòng trống. Toàn bộ output PHẢI là tiếng Việt thuần — không dùng từ Trung Quốc/Nhật/Hàn; nếu thiếu từ thì diễn đạt lại bằng tiếng Việt.`;

  const cfg = getProviderConfig(provider);
  if (!cfg) throw new Error('Dịch vụ AI tạm thời không khả dụng, thử lại sau');

  // Cắt input quá dài → model tập trung vào phần đầu (thường chứa ý chính),
  // giảm chi phí/latency và hạn chế bản tóm tắt lan man. 2560 ký tự đủ phủ
  // ~95% tin VnExpress/Tuổi Trẻ; cắt tiếp 4000→2560 rút thời gian prefill +
  // hạ độ trễ chữ đầu tiên (bài dài là nguồn chậm chính của summarize).
  const MAX_INPUT_CHARS = 2560;
  const inputText = articleText.length > MAX_INPUT_CHARS
    ? articleText.slice(0, MAX_INPUT_CHARS) + '\n…(phần sau đã cắt)'
    : articleText;

  const { url, headers, body } = buildLlmRequest(provider, apiKey, model, prompt, inputText, 480, customBaseUrl);
  // Stream chỉ khi UI muốn xem dần; normalize từng partial để không nhả label
  // ("TL;DR:")/markdown residue lên màn hình giữa chừng.
  const emit = onToken ? (acc: string) => onToken(normalizeStructuredSummary(acc)) : undefined;
  if (emit) body.stream = true; // web+server proxy hỗ trợ SSE passthrough
  const data = await sendLlmRequest(url, headers, body, provider, cfg.label, attemptTimeoutMs, emit);

  // NVIDIA OpenAI-compatible → content trong choices[0].message.content
  const raw = data.choices?.[0]?.message?.content || '';
  return normalizeStructuredSummary(raw);
}

// Làm sạch output model về đúng format chuẩn:
// bỏ label ("TL;DR:", "Tóm tắt:"...), markdown residue, dòng trùng;
// thống nhất bullet về "• "; giới hạn ≤7 dòng chính + ≤4 dữ kiện.
// Ký tự CJK lọt từ model (GLM/Qwen thỉnh thoảng trượt ngôn ngữ) → cảnh báo log.
export function normalizeStructuredSummary(raw: string): string {
  let lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.some((l) => /[一-鿿぀-ヿ가-힯]/.test(l))) {
    console.warn('[summarize] LLM output contains CJK characters — model slipped language');
  }
  lines = lines
    .map((l) => l
      .replace(/^#{1,4}\s*/, '')
      .replace(/^\*\*(.+?)\*\*\s*:?\s*$/, '$1')
      .replace(/^(?:TL;?DR|Tóm\s*tắt|Ý\s*chính|Dữ\s*kiện(?:\s*chính)?|Nội\s*dung(?:\s*chính)?|Chính)\s*[:：—-]\s*/i, '')
      .trim())
    .filter(Boolean)
    .map((l) => l.replace(/^[-*–—]\s+/, '• ').replace(/^•\s*/, '• '))
    .filter((l) => !/^(?:bài\s*báo|bài\s*viết)\s*(?:này|trên)/i.test(l) || l.length > 40) // bỏ dòng mở đầu kiểu "Bài báo này nói về..."
    // Bỏ metadata lọt từ bài (chuyên mục/ngày giờ/ghi chú ảnh — dòng NGẮN không bullet).
    // QUAN TRỌNG: bullet "• " là dữ kiện → LUÔN giữ, không bị filter này nuốt.
    .filter((l) => {
      if (/^•/.test(l)) return true;
      if (l.length > 40) return true;
      return !/(?:^\d{1,2}[\/:]\d{1,2}(?:\/\d{2,4})?|\b\d{1,2}:\d{2}\b|^Thứ\s+\w+[,:]|^(?:Ảnh|Hình|Photo)\s*[:：]|^GMT)/i.test(l);
    });
  if (!lines.length) return '';
  const seen = new Set<string>();
  lines = lines.filter((l) => { const k = l.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  const facts = lines.filter((l) => l.startsWith('•')).slice(0, 3);
  const mains = lines.filter((l) => !l.startsWith('•')).slice(0, 5);
  return [...mains, ...facts].join('\n\n');
}

// Fallback KHÔNG cần AI: chọn-câu extractive khi mọi provider chết/mất mạng.
// Điểm câu = chồng lấn từ khóa với title + ưu tiên câu mở đoạn + câu có số liệu.
// Output cùng cấu trúc với AI (TL;DR / ý chính / • dữ kiện) nên UI hiển thị như thường.
export function buildExtractiveSummary(title: string, blocks: ArticleBlock[]): string {
  const text = blocksToText(blocks);
  if (!text) return '';
  const kw = new Set(
    title.toLowerCase().split(/\s+/).map((w) => w.replace(/[.,!?…:;"'()]/g, '')).filter((w) => w.length >= 4),
  );
  type Cand = { s: string; score: number; order: number };
  const cands: Cand[] = [];
  let order = 0;
  for (const b of blocks) {
    if (b.type !== 'text' || !b.text) continue;
    const sentences = b.text.split(/(?<=[.!?…])\s+/).map((x) => x.trim());
    sentences.forEach((sen, si) => {
      if (sen.length < 40 || sen.length > 260) return;
      const words = sen.toLowerCase().split(/\s+/);
      let kwHits = 0;
      for (const w of words) { const clean = w.replace(/[.,!?…:;"'()]/g, ''); if (kw.has(clean)) kwHits++; }
      const score = kwHits * 2 + (si === 0 ? 1.5 : 0) + (/\d/.test(sen) ? 0.5 : 0);
      cands.push({ s: sen, score, order: order++ });
    });
  }
  if (!cands.length) return '';
  const ranked = [...cands].sort((a, b) => b.score - a.score);
  const tldrCand = ranked[0];
  const picked = ranked.slice(0, 6).sort((a, b) => a.order - b.order);
  const mainLines = picked.filter((c) => c !== tldrCand).slice(0, 5).map((c) => c.s);
  // Dữ kiện KHÔNG lặp câu đã chọn làm ý chính
  const pickedOrders = new Set(picked.map((c) => c.order));
  const facts = ranked
    .filter((c) => /\d/.test(c.s) && !pickedOrders.has(c.order))
    .slice(0, 3)
    .map((c) => '• ' + (c.s.length > 180 ? c.s.slice(0, 177) + '…' : c.s));
  return [tldrCand.s, ...mainLines, ...facts].join('\n\n');
}

// Kiểm tra kết nối: gửi request nhỏ nhất (max_tokens 8, timeout 15s), throw nếu lỗi.
// Dùng chung buildLlmRequest/sendLlmRequest nên auth/endpoint/proxy giống hệt khi summarize thật.
export async function testProviderConnection(
  provider: LLMProvider,
  apiKey: string,
  model: string,
  customBaseUrl?: string,
): Promise<void> {
  const cfg = getProviderConfig(provider);
  if (!cfg) throw new Error('Dịch vụ AI tạm thời không khả dụng, thử lại sau');

  const { url, headers, body } = buildLlmRequest(
    provider, apiKey, model,
    'Bạn là trợ lý kiểm tra kết nối. Trả lời đúng một từ: OK',
    'ping',
    8,
    customBaseUrl,
  );
  const data = await sendLlmRequest(url, headers, body, provider, cfg.label, 15000);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Dịch vụ AI trả về phản hồi rỗng');
}

// High-level: fetch key + model from storage, then summarize
// Provider mặc định của app: NVIDIA NIM (chạy ngay khi start, key có sẵn, miễn phí).
export const DEFAULT_PROVIDER: LLMProvider = 'nvidia';

// Danh sách (provider, model) cần thử, theo thứ tự ưu tiên:
// 1) model người dùng chọn
// 2) các model còn lại, sắp mạnh→yếu (power giảm)
// Mục tiêu: model lỗi → đổi model khác (mạnh nhất trước).
function buildFallbackCandidates(preferredProvider: LLMProvider, preferredModel?: string): { provider: LLMProvider; model: string }[] {
  const out: { provider: LLMProvider; model: string }[] = [];
  const seen = new Set<string>();
  const push = (p: LLMProvider, m: string) => {
    const k = `${p}:${m}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ provider: p, model: m });
  };

  const pCfg = getProviderConfig(preferredProvider);
  if (pCfg) {
    const models = [...pCfg.models].sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
    const pref = preferredModel && models.some((m) => m.id === preferredModel) ? preferredModel : models[0]?.id;
    if (pref) push(preferredProvider, pref);
    for (const m of models) if (m.id !== pref) push(preferredProvider, m.id);
  }
  return out;
}

export async function summarizeArticle(articleText: string, category?: string, onToken?: (partial: string) => void): Promise<string> {
  const storedProvider = ((await AsyncStorage.getItem(KEYS.provider)) as LLMProvider) || DEFAULT_PROVIDER;
  const provider = getProviderConfig(storedProvider) ? storedProvider : DEFAULT_PROVIDER;
  const storedModel = await AsyncStorage.getItem(KEYS.model);
  const candidates = buildFallbackCandidates(provider, storedModel || undefined);

  let lastError: Error = new Error('Tất cả model/provider đều không khả dụng, thử lại sau');
  // Request NHỎ trên native (input <700 ký tự = "tóm nhanh từ mô tả", output
  // ~100-200 token): model nào >20s chưa trả = chết → candidate kế. Web qua
  // proxy /api/llm buffer tới khi LLM xong (15-40s) → KHÔNG cap, kẻo giết oan
  // base đang sống (lỗi đã gặp).
  const fastCapMs = Platform.OS !== 'web' && articleText.length < 700 ? 20000 : undefined;
  for (const c of candidates) {
    const cfg = getProviderConfig(c.provider);
    if (!cfg) continue;
    let apiKey = await AsyncStorage.getItem(KEYS[cfg.keyStorageKey]);
    if (!apiKey) apiKey = DEFAULT_NVIDIA_KEY;

    try {
      const summary = await summarizeWithProvider(articleText, c.provider, apiKey || '', c.model, undefined, category, onToken, fastCapMs);
      // model có thể trả 200 nhưng rỗng (vd reasoning bị tắt thinking) → xem là lỗi, thử model tiếp.
      if (summary && summary.trim().length >= 20) return summary;
      lastError = new Error(`Model ${c.model} (${c.provider}) trả nội dung rỗng`);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError;
}

// ----- Article parsing (Jina markdown → text/ảnh/video blocks) -----

export interface ArticleBlock {
  type: 'text' | 'image' | 'video';
  text?: string;
  url?: string;
  kind?: 'youtube' | 'vimeo' | 'file';
  videoId?: string;
  // Vị trí tương đối trong bài gốc (0..1): tỉ lệ ký tự nội dung đứng TRƯỚC media.
  // Dùng để xếp media vào tóm tắt đúng bố cục bài báo (xem ArticleScreen).
  pos?: number;
  // Chú thích ảnh từ alt-text của trang gốc (nếu có và không phải rác)
  caption?: string;
}

// Alt text dùng làm caption chỉ khi "người thật việc thật": đủ dài, không phải
// quảng cáo, không phải placeholder kiểu "Image 1"/"Hình 2", không phải URL.
function altToCaption(alt: string | undefined): string | undefined {
  if (!alt) return undefined;
  let c = decodeHtml(alt).replace(/\s+/g, ' ').trim();
  // Alt CMS kiểu "Image 4: tieu-thu-sai-..." (Tiền Phong/Tuổi Trẻ) — "Image N:"
  // CHỈ là prefix tự động; phần sau còn đánh giá như caption thường.
  c = c.replace(/^(?:image|hình|ảnh|photo)\s*\d+\s*[:.\-–—]\s*/i, '').trim();
  if (c.length < 4 || c.length > 200) return undefined;
  if (AD_ALT_RE.test(c)) return undefined;
  // Alt còn mỗi số thứ tự ("Image 5") → undefined.
  if (/^(?:image|hình|ảnh|photo)\s*\d+$/i.test(c)) return undefined;
  // Gallery caption tự sinh kiểu "Tên bài - Ảnh 1." / "Ảnh 1." — không phải
  // caption thật (caption thật nằm trong <figcaption> hoặc dòng text sau ảnh).
  if (/(?:^|[\-–—])\s*(?:Ảnh|Hình|ảnh|hình|Photo|photo|Image|image)\s*\d+\s*\.?\s*$/i.test(c)) return undefined;
  // Alt là FILENAME ("hlts-1-1785914384-21280297.jpg", "679978052-...-n.jpg")
  // hoặc slug kebab chữ thường toàn bộ → placeholder CMS, không phải caption.
  if (/\.(jpe?g|png|webp|avif|gif|bmp|svg)(?:\s|$|[?,";:])/i.test(c)) return undefined;
  if (/^[a-z0-9áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ\.\-_\d ]+$/.test(c) && !/[A-ZÀ-Ỹ]/.test(c)) return undefined;
  if (/https?:\/\//i.test(c)) return undefined;
  return c;
}

// Caption dài quá ngưỡng → AI rút gọn ở cuối file (aiCondenseCaptions) —
// user muốn tóm tắt thật sự, không phải cắt "…" theo công thức.

// Alt placeholder kiểu CMS: "Image 5: filename.jpg" → Ảnh là thumbnail carousel/
// UI chứ không phải ảnh nội dung → bỏ luôn BLOCK ảnh (không chỉ bỏ caption).
const AUTO_ALT_RE = /^(?:image|hình|ảnh|photo|Ảnh)\s*\d+/i;

// Khóa so sánh ảnh trùng: cùng file khác query (?w=&h= zoom) vẫn là MỘT ảnh.
export function baseUrlKey(url: string): string {
  return url.split(/[?#]/)[0].replace(/^\/\//, 'https://');
}

// Hai URL trùng FILE ảnh (cùng tên file cuối) dù khác thư mục resize:
// vd SGGP hero /w800/.../abc.png.webp và ảnh trong bài /w680/.../abc.png.webp
// là CÙNG một tấm — dùng để không render trùng ảnh hero trong khối tóm tắt.
export function sameImageFile(a: string, b: string): boolean {
  const last = (u: string) => (u.split(/[?#]/)[0].split('/').pop() || '').toLowerCase();
  const la = last(a);
  return !!la && la.length > 8 && la === last(b); // >8 ký tự tránh trùng ngẫu nhiên kiểu "a.png"
}

// Jina Reader trả markdown + header metadata (Title:/URL Source:/Published Time:/"Markdown Content:").
// Cắt header, giữ lại phần nội dung thật.
function stripJinaHeader(raw: string): string {
  let s = raw.replace(/^﻿/, '');
  const label = s.indexOf('Markdown Content:');
  if (label >= 0) return s.slice(label + 'Markdown Content:'.length);
  return s.replace(
    /^(?:Title|URL Source|URL|Published Time|Source|Comment|Category|Last Updated|Why I) *: *[^\n]*\n+/gi,
    '',
  );
}

// Bỏ markup markdown còn sót trong 1 đoạn text → text đọc được.
function cleanMarkdownText(s: string): string {
  return s
    .replace(/!?\[[^\]]*\]\(javascript:[^)\n]*/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/!?\[\]\([^)]*\)/g, ' ')
    // Heading-link tới bài KHÁC (related card lồng trong bài: "### [Headline](url-article)")
    // → bỏ hẳn, không để headline bài khác lọt thành text. (Các khối bài KHÁC
    // có kèm đoạn body được xử lý trong parseArticleBlocks — nơi có pageUrl.)
    .replace(/^#{1,4}\s*\[[^\]]+\]\(https?:\/\/[^)\s]*\.(?:tpo|html|chn|vn|com\.vn)[^)]*\)/gim, '')
    // Dòng chỉ gồm 1 link tới BÀI KHÁC — carousel "tin liên quan" của site nhúng
    // NGAY TRONG thân bài, không có heading (khác RELATED_RE ở cuối bài):
    // [Tiêu đề bài khác](https://...html) → bỏ hẳn, không để tiêu đề bài khác
    // lọt thành text trong tóm tắt.
    .replace(/^\s*\[[^\]]{4,160}\]\(\s*https?:\/\/[^\s)\]]+\.[a-zA-Z]{2,}(?:\/[^\s)\]]*)?(?:\s+"[^"]*")?\)\s*$/gim, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Phần đuôi "](full-url)" của ảnh bọc [![...](thumb)](full) lọt xuống đầu
    // text block kế tiếp → bỏ dòng rác này, không để nó nuốt dòng caption thật.
    .replace(/^\s*\]\([^)\s]*\)\s*$/gm, '')
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)([^*_\n]+)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s*(?:[*+-]|\d+[.)])[ \t]+/gm, '')
    .replace(/^[ \t]*\[[ xXoO]?\][ \t]*/gm, '')
    // Chrome trình phát video nhúng cuối bài (VnExpress…): "0:00 / 0:00",
    // "Next video", "Tiếp theo (5s):", "Bật tiếng", "Tua lại 3 giây"… không phải
    // nội dung → xoá sạch để không lọt vào tóm tắt.
    .replace(/0:\d\d\s*\/\s*0:\d\d/g, ' ')
    .replace(/(?:Dialog\s*End\s*of\s*dialog\s*window|Next\s*video|Tiếp\s*theo\s*\(\d+s\):|Bật\s*tiếng|Tắt\s*tiếng|Tua\s*lại\s*3\s*giây|Tua\s*đi\s*3\s*giây|Phát\s*tiếp|Remaining\s*Time)/gi, ' ')
    // Thanh share-bar (ANTD.Vn…): `); "Facebook")); "Twitter")); "In bài viết")`
    // lọt vào thân bài sau byline → xoá phần `)); "..."` thừa.
    .replace(/\)\);\s*"[^"]*"/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // decodeHtml gọi sau cùng — chỉ giữ khi module đã load xong (runtime).
  return decodeHtml(s);
}

// Bọc cleanMarkdownText + decode entity HTML trên KẾT QUẢ đã làm sạch
// (sửa bug: bản cũ return sạch rồi mới tới dòng decodeHtml(s) → code dead,
//  entity trong body text không bao giờ được decode).
function cleanMarkdownTextDecoded(s: string): string {
  return decodeHtml(cleanMarkdownText(s));
}

// Host của mạng quảng cáo/tracking (VN + quốc tế) chèn banner/player giả vào bài.
// Test theo SUBSTRING của hostname nên bắt được cả subdomain lạ của cùng mạng QC.
const AD_HOST_TOKENS = [
  // Quốc tế
  'doubleclick', 'googlesyndication', 'googleadservices', 'adservice.google',
  'taboola', 'outbrain', 'criteo', 'pubmatic', 'rubiconproject', 'openx',
  'smartadserver', 'moatads', 'scorecardresearch', 'amazon-adsystem',
  'revcontent', 'mgid', 'teads', 'sharethrough', 'casalemedia', 'bidswitch',
  // VN
  'admicro', 'vcmedia', 'zingads', 'e-click', 'eclick', 'adasia', 'avplayer.com',
  'gliastudios', 'adnetwork', 'adserver', 'adsys.', 'vlitag', 'adccheme',
  // Native ads shoppable (Kenh14/Cafebiz nhúng sản phẩm Shopee/Sendo/Lazada)
  'shopee', 'sendo', 'lazada', 'lazcdn',
];

function isAdHost(url: string): boolean {
  const host = url.replace(/^(https?:)?\/\//i, '').split(/[/?#:]/)[0].toLowerCase();
  return AD_HOST_TOKENS.some((t) => host.includes(t));
}

// Alt text của ảnh QC/banner mà trang báo chèn vào giữa bài
const AD_ALT_RE = /(quảng cáo|banner|advert|sponsored|tài trợ|^logo$|^qc$)/i;

// Đoạn văn bản QC/CTA đứng riêng giữa bài (liên hệ QC, tin tài trợ, tải app…).
// Chỉ áp dụng cho block NGẮN để không giết nhầm nội dung thật nói về chủ đề đó.
const AD_TEXT_RE = /(liên hệ\s*(quảng cáo|qc)|tin tài trợ|bài viết tài trợ|nhà tài trợ|đăng ký nhận (tin|bản tin)|tải (ngay |ứng dụng )?app\b|hotline[: ]?\d{2}[ .]?\d)/i;

// General patterns for non-editorial media (applies to ALL news sites)
// Thumbnail/CDN patterns: zoom/W_H, thumb, crop, resize
const THUMBNAIL_PATH_PATTERNS = [
  /\/zoom\/\d+_\d+\//i,           // zoom/600_315/, zoom/320_180/, etc.
  /\/thumb\//i,                    // /thumb/ path
  /\/crop\//i,                     // /crop/ path
  /\/resize\//i,                   // /resize/ path
  /\/(small|medium|large)\//i,     // /small/, /medium/, /large/ paths
];
// Filename patterns for non-content images
const NON_EDITORIAL_FILENAME_PATTERNS = [
  /brand.?content/i,              // brandcontent, brand-content (native ads)
  /sponsored|advertorial|native.?ad/i, // sponsored content
  /logo/i,                        // site logos
  /avatar/i,                      // author/profile avatars
  /icon/i,                        // UI icons
  /sprite/i,                      // CSS sprites
  /tracking|pixel|beacon/i,       // tracking pixels
  /social|share|facebook|zalo|tiktok|instagram|youtube/i, // social icons — KHÔNG viết tắt fb/tw/ig/yt: khớp giữa chuỗi (vd signature CDN "...Jdpweig") chặn nhầm ảnh thật
  /newslette|newsletter/i,          // newsletter signup banners
  /no-ava|no_ava|default-ava|avatar-default|placeholder|thumb-default/i, // placeholder avatar (Tiền Phong/TP NOW...)
];
// Fake video: .gif.mp4, .webp.mp4 = animated images, not real videos
const FAKE_VIDEO_PATTERN = /\.(gif|webp)\.mp4(\?|#|$)/i;

// Kích thước banner QC chuẩn (IAB + size phổ biến ở báo VN). Xuất hiện trong
// query w&h hoặc tên file NNNxNNN → gần như chắc chắn là banner, không phải
// ảnh nội dung (ảnh bài thật: 16:9, 4:3, 3:2… hoặc h=0 auto của VnExpress).
const STANDARD_AD_SIZES = new Set([
  '300x250', '336x280', '250x250', '200x200', '300x100', '300x90', '300x50',
  '320x50', '320x100', '468x60', '234x60', '728x90', '970x90', '970x250',
  '160x600', '120x600', '300x600', '980x90', '980x120', '1000x120', '1010x120',
]);
// Thư mục QC trong path — chỉ match SEGMENT (…/ads/…) để không giết nhầm file
// nội dung chỉ trùng chữ ở giữa tên ("photo-download.jpg" phải sống sót).
const AD_PATH_RE = /(?:^|\/)(?:ads?|adv|advert|banner|banners|quangcao|quang-cao|qc)\//i;

// Chỉ giữ ảnh NỘI DUNG thật của bài; bỏ mọi thứ là UI của trang báo:
// - svg/gif (icon, loading), đường path /restruct/ /graphics/ /icons/
// - thumbnail nhỏ (sidebar "tin liên quan", "đọc nhiều") của bài báo khác (w nhỏ)
// - UI icons: ava_inter, ggr/x2, social icons, tracking pixels
// VnExpress ảnh bài thật = w=1020&h=0 (h=0 là auto, đừng chặn), thumbnail khác = w=180/300.
function isEditorialImage(url: string): boolean {
    // blob:/data: = object URL của trình duyệt render, không phải ảnh thật của bài
    if (!/^(https?:)?\/\//i.test(url)) return false;
    // Phải là file ảnh thật: Jina đôi khi biến <a> thành ![Image N](link-bai.html)
    // → render ra <img> giả. Chỉ nhận URL có đuôi ảnh trước query/hash.
    if (!/\.(jpe?g|png|webp|avif|bmp)(\?|#|$)/i.test(url)) return false;
    if (/\.(svg|gif)(\?|#|$)/i.test(url)) return false;
    if (/\/restruct\/|\/graphics\/|\/icons\//i.test(url)) return false;
    // /zoom/W_H/ luôn là thumbnail (sidebar/tin liên quan). /thumb_w/N/ chỉ chặn N nhỏ:
    // Thanh Niên/Tuổi Trẻ trả ảnh bài thật qua /thumb_w/640|730/ — chặn hết là mất ảnh nội dung.
    if (/\/zoom\/\d+_\d+\//i.test(url)) return false;
    const thumbW = url.match(/\/thumb_w\/(\d+)\//i);
    if (thumbW && +thumbW[1] < 400) return false;
    // Static assets của tòa soạn (avatar tác giả, banner promo, logo): /web_images/
    if (/\/web_images\//i.test(url)) return false;
    if (/(^|\/)(crop|resize|small|medium|avatar|avatar-|icon-|logo-|sprite|tracking|pixel|beacon)(\/|_|-|\.)/i.test(url)) return false;
    // Filter related articles/sidebar thumbnails: /related/, /sidebar/, /widget/, /recommend/, /more-news/, /box-/, /list-/
    if (/(related|sidebar|widget|recommend|more.?news|box.|list.|also.?read|xem.?them|tin.?lien.?quan|doc.?nhieu|khac.?bai)(\/|_|-|\.)/i.test(url)) return false;
    // Suffix thumb: -thumb, _thumb, -small… KHÔNG gạch "crop" giữa tên file —
    // Báo Chính phủ/Tuổi Trẻ đặt tên ảnh nội dung "ten-1000-crop-<ts>.jpg";
    // crop thật đã có rule (^|/)crop/ ở trên chặn.
    if (/(-|_)(thumb|small|preview|teaser)\d*(\/|_|-|\.|$)/i.test(url)) return false;
    // Chỉ chặn avatar vuông nhỏ (w=h<=100). Không chặn ảnh nội dung tỷ lệ ngang/dọc
    // vì Jina giữ nguyên tham số w/h của site gốc (VD VnExpress dùng ?w=300&h=180).
    const wParam = url.match(/[?&](?:w|width)=(\d+)/i);
    const hParam = url.match(/[?&](?:h|height)=(\d+)/i);
    if (wParam && hParam) {
      const w = +wParam[1], h = +hParam[1];
      if (w > 0 && h > 0 && w <= 100 && h <= 100) return false;
      // Banner QC rất ngang (640x180, 970x170, 728x120…) — ảnh bài thật hiếm khi
      // h/w <= 0.3; h=0 (VnExpress auto) phải nhường qua rule dưới.
      if (w >= 300 && h > 0 && h / w <= 0.3) return false;
    }
    // Thumbnail nhỏ: w < 400 và h=0 (hoặc không h) → ảnh thumb gallery/tin liên
    // quan (VnExpress ảnh nội dung thật = w=1020+&h=0; w=220&h=0&q=80 là thumb).
    // GIỮ w nhỏ kèm h cắt (VD w=300&h=180) — ảnh card nội dung.
    if (wParam && +wParam[1] > 0 && +wParam[1] < 400 && (!hParam || +hParam[1] === 0)) return false;
    // Filter 1x1, 2x2 tracking pixels
    if (/[?&](w|width)=[12]&?(h|height)=[12]/i.test(url)) return false;
    // Ad/tracking pixel đội lốt ảnh (vd cl.vlitag.com/tf-v1.jpeg?e=...): query
    // rất dài, không có tham số kích thước như ảnh CDN thật.
    const qIdx = url.indexOf('?');
    if (qIdx >= 0 && url.length - qIdx > 150 && !/[?&](w|width|h|height)=/i.test(url)) return false;
    // Banner QC chuẩn IAB: w&h khớp size banner (300x250, 728x90, 970x250…) hoặc
    // tên file chứa NNNxNNN. Ảnh nội dung không bao giờ đúng kích thước banner.
    const dimQ = url.match(/[?&](?:w|width)=(\d{2,4})[&](?:h|height)=(\d{2,4})/i);
    if (dimQ && STANDARD_AD_SIZES.has(`${dimQ[1]}x${dimQ[2]}`)) return false;
    const dimFile = url.match(/(\d{2,4})x(\d{2,4})\.(?:jpe?g|png|webp)(?:\?|#|$)/i);
    if (dimFile && STANDARD_AD_SIZES.has(`${dimFile[1]}x${dimFile[2]}`)) return false;
    // Thư mục QC trong path: /ads/, /banner/, /quangcao/… (segment-exact).
    if (AD_PATH_RE.test(url)) return false;
    // Filter UI icon filenames common in VN news sites
    if (/(ava_inter|ggr[_-]x2|x[_-]x2|mail[_-]x2|banmuon|ting|cacnguon|laptoptn|banmuonmb)/i.test(url)) return false;
    // Filter social/share icons
    if (/(facebook|twitter|zalo|tiktok|instagram|youtube|share|send|comment|like|view|print|email|sms|copy|link|download)[_-]?(icon|btn|button)?/i.test(url)) return false;
    // Badge "Theo dõi trên Google News / Apple News" + asset UI của theme site
    // (vd SGGP: static-cms.../v4/web/styles/img/gg-news.png)
    const imgHost = url.replace(/^(https?:)?\/\//i, '').split(/[/?#:]/)[0].toLowerCase();
    if (imgHost.includes('static-cms')) return false;
    if (/\/(?:web\/)?styles?\/(?:img|images?|icons?)\//i.test(url)) return false;
    if (/(?:google|apple|gg)[-_.]?news/i.test(url)) return false;
    // General non-editorial patterns (all sites): thumbnail paths, sponsored/ad content, logos, avatars
    for (const pattern of THUMBNAIL_PATH_PATTERNS) {
      if (pattern.test(url)) return false;
    }
    for (const pattern of NON_EDITORIAL_FILENAME_PATTERNS) {
      if (pattern.test(url)) return false;
    }
    return true;
  }

function classifyVideo(url: string): ArticleBlock | null {
  if (isAdHost(url)) return null;
  // Fake videos: .gif.mp4, .webp.mp4 = animated images, not real video content (all sites)
  if (FAKE_VIDEO_PATTERN.test(url)) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/))([\w-]{6,})/);
  if (yt) return { type: 'video', url, kind: 'youtube', videoId: yt[1] };
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return { type: 'video', url, kind: 'vimeo', videoId: vm[1] };
  // Real video files (not animated GIFs served as MP4)
  if (/\.(mp4|webm|mov|ogv)(\?|#|$)/i.test(url) && !FAKE_VIDEO_PATTERN.test(url)) return { type: 'video', url, kind: 'file' };
  return null;
}

// Một số báo (Tiền Phong...) nhúng widget "AI TÓM TẮT" NGAY TRONG thân bài:
// widget chứa bản tóm tắt sẵn của tờ báo + CAROUSEL "tin liên quan" (ảnh +
// tiêu đề của BÀI KHÁC — Campuchia, Nepal, Na Uy...). Chính cái carousel này
// khiến tóm tắt của app dính ảnh/text không liên quan bài gốc. Cắt cả khối
// (marker đầu → marker cuối) trên chuỗi THÔ trước khi tách block; 2 chuỗi đặc
// trưng này không xuất hiện trong nội dung bài thật nên không cắt nhầm.
function stripSiteWidgets(s: string): string {
  const withEnd = s.replace(/AI\s*TÓM\s*TẮT[\s\S]*?Copy\s*tóm\s*tắt/gi, '');
  if (withEnd !== s) return withEnd;
  // Jina đôi khi bỏ nút "Copy tóm tắt" → mốc cuối mất. Fallback AN TOÀN: chỉ cắt
  // nếu phía sau widget có heading bài thật (# ...) — không có heading thì để
  // nguyên (không cắt nhầm thân bài; lúc đó các lớp khác như AUTO_ALT_RE lo).
  const m = s.match(/AI\s*TÓM\s*TẮT[\s\S]*?(?=#{1,3}\s)/i);
  if (m && m.index !== undefined) {
    s = s.slice(0, m.index) + s.slice(m.index + m[0].length);
  }
  // VnExpress: widget "AI TÓM TẮT" render client-side (Jina KHÔNG bắt được),
  // nhưng Jina vẫn append ĐUÔI trang gồm: (1) CTA "Chọn VnExpress làm nguồn ưu
  // tiên trên Google Search" (có cả Bước 1/Bước 2 và ảnh nguonuutien.jpg) và
  // (2) danh sách "tin liên quan" (headline + "1h trước"). Cắt từ mốc đầu CTA
  // trở đi — cả 2 khối rác đều nằm sau mốc này nên bị loại sạch.
  const vne = s.search(/Thêm VnExpress trên Google|Chọn VnExpress làm nguồn ưu tiên/i);
  if (vne >= 0) s = s.slice(0, vne);
  return s;
}

// Parse markdown → mảng block giữ nguyên vị trí text/ảnh/video (để render xen kẽ "dưới mỗi text").
// pageUrl (nếu có) giúp phân biệt ảnh nội dung bọc link về CHÍNH bài (gallery
// self-link của Báo CP/CAND…) với thumbnail related bọc link bài khác.

export function parseArticleBlocksAsync(raw: string, pageUrl = ''): Promise<ArticleBlock[]> {
  // Parse markdown Jina (~100KB, hàng chục regex full-scan) QUA HÀNG ĐỢI CPU —
  // chạy đồng bộ sẽ chặn JS thread đúng lúc mở bài/prefetch lúc mới launch.
  return runCpuTask(() => parseArticleBlocks(raw, pageUrl));
}

export function parseArticleBlocks(raw: string, pageUrl = ''): ArticleBlock[] {
  const s = stripSiteWidgets(stripJinaHeader(raw));
  const blocks: ArticleBlock[] = [];

  // Mốc cắt: bắt đầu mục "Bài viết liên quan" / "Tin cùng chuyên mục" / "Đọc thêm"
  // / "Có thể bạn quan tâm" / "Related"… Jina hay để nguyên mục này cuối markdown,
  // kéo theo text + ảnh/video của BÀI KHÁC lẫn vào blocks.
  const RELATED_RE = /^[\s#>]*(?:\*{1,3}|_{1,3})?\s*\[?(?:Bài\s*viết\s*liên\s*quan|Bài\s*liên\s*quan|Tin\s*liên\s*quan|Nội\s*dung\s*liên\s*quan|Chủ\s*đề\s*liên\s*quan|Tin\s*cùng\s*chuyên\s*mục|Cùng\s*chuyên\s*mục|Bài\s*viết\s*cùng\s*chủ\s*đề|Tin\s*nổi\s*bật|Đọc\s*thêm|Xem\s*thêm|Có\s*thể\s*bạn\s*quan\s*tâm|Có\s*thể\s*bạn\s*muốn\s*xem|Bạn\s*có\s*thể\s*quan\s*tâm|Đừng\s*bỏ\s*lỡ|Gợi\s*ý\s*cho\s*bạn|Đề\s*xuất|Tin\s*đọc\s*nhiều|Đọc\s*nhiều|Xem\s*nhiều|Xem\s*nhiều\s*nhất|Tin\s*đáng\s*chú\s*ý|Đáng\s*chú\s*ý|Tin\s*khác|Các\s*tin\s*khác|Tin\s*tức|Tin\s*mới|Tin\s*mới\s*nhất|Mới\s*nhất|Related(?:\s*(?:articles|news|stories))?|Recommended|Also\s*read|Trending|Read\s*more|More\s*from)(?:\]?\s*\([^)]*\))?\s*(?:\*{1,3}|_{1,3})?\s*[:：\-–—]*$/im;
  const findRelatedStart = (text: string): number => {
    const m = text.match(RELATED_RE);
    return m ? (m.index ?? -1) : -1;
  };

  // Đánh dấu vị trí ảnh và video trong text
  const markers: { index: number; end: number; block: ArticleBlock }[] = [];
  const seenBase = new Set<string>(); // dedupe theo base URL — VnExpress trả ảnh ~2 lần với ?w= khác nhau
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m;
  while ((m = imgRe.exec(s)) !== null) {
    if (isAdHost(m[2])) continue;
    if (m[1] && AD_ALT_RE.test(m[1].trim())) continue;
    if (!isEditorialImage(m[2])) continue;
    // Ảnh bị bọc link [![alt](img.jpg)](href):
    //  - href trỏ tới CHÍNH ảnh (zoom full: CÙNG FILE, khác thư mục resize như
    //    /thumb_w/730/... của Tuổi Trẻ) → ảnh nội dung thật → GIỮ, kể cả alt tự
    //    sinh kiểu "Image 21: ..." — caption thật nằm ở dòng text ngay sau ảnh.
    //  - href trỏ tới ảnh/bài KHÁC → thumbnail "tin liên quan"/banner QC → BỎ.
    const wrapped = s[m.index - 1] === '[' && s.startsWith('](', m.index + m[0].length);
    let markerStart = m.index;
    let markerEnd = m.index + m[0].length;
    if (wrapped) {
      const close = s.indexOf(')', m.index + m[0].length + 2);
      const wrapUrl = close >= 0 ? s.slice(m.index + m[0].length + 2, close) : '';
      const wrapHref = wrapUrl.split(/\s/)[0]; // markdown: URL có thể kèm "title"
      const isSelfZoom = !!wrapHref && sameImageFile(wrapHref, m[2]);
      // gallery lightbox bọc ảnh bằng link về CHÍNH bài đang đọc (Báo Chính
      // phủ, CAND…) → vẫn là ảnh nội dung. Chỉ bỏ khi href trỏ bài KHÁC.
      const isSelfArticle = !!wrapHref && !!pageUrl && !articlePathDiffers(wrapHref, pageUrl);
      if (!isSelfZoom && !isSelfArticle) continue;
      // Bao trọn [![...](thumb)](full) vào marker: phần ](full) không lọt thành
      // text rác trước dòng caption thật.
      markerStart = m.index - 1;
      if (close >= 0) markerEnd = close + 1;
    }
    const baseKey = baseUrlKey(m[2]);
    if (seenBase.has(baseKey)) continue;
    seenBase.add(baseKey);
    const cap = altToCaption(m[1]);
    markers.push({ index: markerStart, end: markerEnd, block: { type: 'image', url: m[2], pos: m.index / Math.max(s.length, 1), ...(cap ? { caption: cap } : {}) } });
  }
  // Site lazy-load / tối ưu SEO → Jina giữ <img src="..."> raw thay vì ![alt](url). Bắt cả 2 định dạng.
  const htmlImgRe = /<img\s[^>]*>/gi;
  while ((m = htmlImgRe.exec(s)) !== null) {
    const tag = m[0];
    const um = tag.match(/(?:\bsrc|data-src)=["']([^"']+)["']/i);
    const url = um?.[1];
    if (!url || isAdHost(url)) continue;
    if (!isEditorialImage(url)) continue;
    const rawAlt = (tag.match(/\balt=["']([^"']*)["']/i) || [])[1];
    if (rawAlt && (AD_ALT_RE.test(rawAlt.trim()) || AUTO_ALT_RE.test(rawAlt.trim()))) continue;
    const baseKey = baseUrlKey(url);
    if (seenBase.has(baseKey)) continue;
    seenBase.add(baseKey);
    const cap = altToCaption(rawAlt);
    markers.push({ index: m.index, end: m.index + tag.length, block: { type: 'image', url, pos: m.index / Math.max(s.length, 1), ...(cap ? { caption: cap } : {}) } });
  }
  // Chỉ bắt link/video có pattern YouTube, Vimeo, hoặc đuôi file video - bỏ qua link bài báo khác
  const vidRe = /\[[^\]]*\]\((https?:\/\/(?:youtu\.be|youtube\.com|vimeo\.com|[^)]+\.(?:mp4|webm|mov|ogv))[^)]*)\)|(https?:\/\/(?:youtu\.be|youtube\.com|vimeo\.com|[^\s)\]]+\.(?:mp4|webm|mov|ogv)))/gi;
  // Mốc "tin liên quan" tính TRÊN TOÀN chuỗi: video link PHÍA SAU mốc là video
  // của BÀI KHÁC (carousel tin liên quan nhúng link YouTube/mp4) → bỏ hết.
  // Trước đây vòng quét video chạy trên toàn s, không tôn trọng mốc cắt →
  // video bài khác lọt vào tóm tắt.
  const relCut = findRelatedStart(s);
  while ((m = vidRe.exec(s)) !== null) {
    if (relCut >= 0 && m.index > relCut) continue;
    const url = m[1] || m[2];
    if (!url) continue;
    const baseKey = baseUrlKey(url);
    if (seenBase.has(baseKey)) continue;
    seenBase.add(baseKey);
    const v = classifyVideo(url);
    if (v) markers.push({ index: m.index, end: m.index + m[0].length, block: { ...v, pos: m.index / Math.max(s.length, 1) } });
  }
  markers.sort((a, b) => a.index - b.index);

  // Dựng dãy block: text giữa các marker, rồi đến media.
  // Dòng ngắn khớp mẫu QC/CTA bị TÁCH BỎ khỏi block (không bỏ nguyên block —
  // đoạn QC thường dính liền đoạn thật trong cùng khối text Jina trả về).
  const scrubAdLines = (t: string) => t
    .split('\n')
    .filter((line) => !(line.length < 300 && AD_TEXT_RE.test(line)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  let last = 0;
  let stopped = false;
  for (const mk of markers) {
    if (stopped || mk.index < last) continue;
    const rawSlice = s.slice(last, mk.index);
    // Cắt tại mốc "Bài liên quan"… — mọi text + media phía sau đều của bài khác.
    const relIdx = findRelatedStart(rawSlice);
    if (relIdx >= 0) {
      const text = scrubAdLines(cleanMarkdownTextDecoded(rawSlice.slice(0, relIdx)));
      if (text) blocks.push({ type: 'text', text });
      stopped = true;
      break;
    }
    const text = scrubAdLines(cleanMarkdownTextDecoded(rawSlice));
    if (text) blocks.push({ type: 'text', text });
    blocks.push(mk.block);
    last = mk.end;
  }
  if (!stopped) {
    const rawRest = s.slice(last);
    const relIdx = findRelatedStart(rawRest);
    const rest = scrubAdLines(cleanMarkdownTextDecoded(relIdx >= 0 ? rawRest.slice(0, relIdx) : rawRest));
    if (rest) blocks.push({ type: 'text', text: rest });
  }

  // Caption thật của báo: Jina giữ thành dòng riêng NGAY SAU ảnh lẫn trong block
  // text kế tiếp — kiểu "Ảnh: ...", "Hình: ...", "Clip: ...", "Nguồn: ...",
  // hoặc gallery "Tên phim - Ảnh 1." (Tuổi Trẻ). Dời dòng này thành caption của
  // ảnh (như bố cục bài gốc) + tách khỏi text để không lọt vào nội dung AI tóm.
  // Nhận diện: dòng NGẮN sau ảnh có từ khóa caption theo sau bởi dấu phân cách
  // ("Ảnh: ...", "Hình 1.", "Clip: ...", "Nguồn: ...", gallery "Tên phim - Ảnh 2.").
  // KHÔNG dùng \b — ký tự Việt hoa dấu ("Ả") không phải \w ASCII nên \b không khớp.
  // Yêu cầu separator để không bắt nhầm từ chứa "hình" ("hình thức", "hình thành")
  // hay "video" trong câu văn thật. Caption thật có thể dài (~140 ký tự) nhưng
  // thường KẾT THÚC bằng "Ảnh: <nguồn>" — dòng càng dài càng phải chắc chắn.
const isCaptionLine = (line: string): boolean => {
    const l = line.trim();
    if (!l || l.length > 200) return false;
    if (/https?:\/\//i.test(l)) return false;
    if (/(?:Ảnh|Hình|Photo|Clip|Video|Nguồn|Nguon)\s*[:：\d]/i.test(l)) {
      if (l.length <= 120) return true;
      // Dòng dài → chỉ nhận khi kết thúc rõ kiểu caption "… - Ảnh: Nguồn"
      return /(?:Ảnh|Hình)\s*[:：]\s*\S+$/i.test(l) || /-\s*\(?(?:Ảnh|Hình)\s*[:：]/i.test(l);
    }
    // KHÔNG có keyword: báo kiểu Tiền Phong/Thanh Niên để caption TRẦN ngay dưới ảnh
    // ("Kalli Nguyễn nhiều lần đăng ảnh hẹn hò cùng Johnny Trí Nguyễn.",
    //  "Một góc làng biển Cảnh Dương"). Ảnh carousel/related bài khác đã bị
    // wrapper-check chặn ở trên nên dòng đứng sát sau ảnh giữ lại gần như chắc
    // chắn là caption. Guard: câu ngắn kết thúc bằng dấu câu, không phải
    // số/metadata đơn. (KHÔNG bỏ dấu câu — nếu không body text dài lọt làm
    // caption, gây lỗi "caption không hiển thị" cho ảnh thứ 2 trong gallery.)
    if (l.length < 20 || l.length > 110) return false;
    if (!/[.!…”)\]]$/.test(l) || !/[a-zà-ỹ]/i.test(l)) return false;
    return !/^(?:Ngày|Cập nhật|Cập nhat|Bản dựng|Năm|Tháng|Mùa)/i.test(l);
  };
  const isCreditLine = (line: string) => {
    const l = (line || '').trim();
    return l.length >= 4 && l.length <= 60 && /^(?:Ảnh|Hình|Photo|ẢNH|HÌNH|Photo|Clip|Video|Nguồn)\s*[:：]/i.test(l);
  };
  const withCaps: ArticleBlock[] = [];
  for (const b of blocks) {
    const prev = withCaps[withCaps.length - 1];
    if (
      b.type === 'text' && b.text && prev && (prev.type === 'image' || prev.type === 'video') && !prev.caption
    ) {
      const lines = b.text.split('\n');
      // Tìm dòng đầu tiên không rỗng sau ảnh → thử làm caption.
      const firstIdx = lines.findIndex((l) => l.trim());
      const first = firstIdx >= 0 ? lines[firstIdx].trim() : '';
      const secondIdx = firstIdx >= 0 ? lines.findIndex((l, i) => i > firstIdx && l.trim()) : -1;
      const second = secondIdx >= 0 ? lines[secondIdx].trim() : '';
      // Thanh Niên để caption TRẦN không dấu câu ("Một góc làng biển Cảnh Dương")
      // rồi dòng kế tiếp là credit ngắn ("Ảnh: NGUYỄN PHÚC") → nhận dòng 1.
      // Ngược lại body text dài lọt sau ảnh KHÔNG được tính caption.
      const bareCaption = !isCaptionLine(first) && !isCreditLine(first)
        && first.length >= 20 && first.length <= 110
        && /[a-zà-ỹ]/i.test(first)
        && !/^(?:Ngày|Cập nhật|Cập nhat|Bản dựng|Năm|Tháng|Mùa|\d)/i.test(first)
        && !/https?:\/\//i.test(first)
        && isCreditLine(second);
      const capLine = isCaptionLine(first) ? first : bareCaption ? first : isCaptionLine(second) ? second : '';
      if (capLine) {
        prev.caption = decodeHtml(capLine.replace(/^[\s*_>#-]+/, '').replace(/[\s*_]+$/, '').trim());
        const rmIdx = capLine === first ? firstIdx : secondIdx;
        lines.splice(rmIdx, 1);
        const rest = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        if (rest) { b.text = rest; withCaps.push(b); }
        continue;
      }
    }
    withCaps.push(b);
  }
  return withCaps;
}

// Gộp các block text thành 1 chuỗi (nguồn cho AI tóm tắt + đếm thời gian đọc).
export function blocksToText(blocks: ArticleBlock[]): string {
  return blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n');
}

// Trang bài dạng VIDEO (video.vnexpress.net/..., /video/...): player là JS,
// Jina markdown không chứa stream. Nhận diện thô để biết khi nào cần hỏi
// proxy bóc m3u8 từ HTML (sai positive chỉ tốn 1 request nhẹ, vô hại).
export function isVideoPageUrl(url: string): boolean {
  return /(\/\/video\.|\/video[./-])/i.test(url);
}

// Lấy ảnh/video BÀI GỐC trực tiếp từ HTML trang (native fetch không bị CORS).
// Jina đôi khi bọc ảnh nội dung trong link bài liên quan (bị lọc) hoặc trang
// video giấu stream — fallback này bổ sung og:image + img + video thật vào blocks.
const UA_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

// Named entities HTML thường gặp (tiếng Việt + chung). decodeHtml lặp 2 lần để
// bắt entity lồng nhau kiểu "&amp;aacute;" sau khi &amp; đã thành &.
const HTML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  laquo: '«', raquo: '»', bull: '•', middot: '·', deg: '°', times: '×', minus: '−',
  aacute: 'á', agrave: 'à', atilde: 'ã', acirc: 'â', abreve: 'ă',
  eacute: 'é', egrave: 'è', ecirc: 'ê',
  iacute: 'í', igrave: 'ì', icirc: 'î',
  oacute: 'ó', ograve: 'ò', otilde: 'õ', ocirc: 'ô',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', yacute: 'ý',
  ntilde: 'ñ', ccedil: 'ç', auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü',
  Aacute: 'Á', Agrave: 'À', Atilde: 'Ã', Acirc: 'Â', Abreve: 'Ă',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê',
  Iacute: 'Í', Igrave: 'Ì', Icirc: 'Î',
  Oacute: 'Ó', Ograve: 'Ò', Otilde: 'Õ', Ocirc: 'Ô',
  Uacute: 'Ú', Ugrave: 'Ù', Ucirc: 'Û', Yacute: 'Ý',
  Ntilde: 'Ñ', Ccedil: 'Ç', Auml: 'Ä', Euml: 'Ë', Iuml: 'Ï', Ouml: 'Ö', Uuml: 'Ü',
};

function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, ent: string) => {
    if (ent[0] === '#') {
      const hex = ent[1] === 'x' || ent[1] === 'X';
      const code = parseInt(ent.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : m;
    }
    return HTML_ENTITIES[ent] ?? m;
  });
}

// Entity lồng nhau ("&amp;aacute;") → &amp; thành & ở lượt 1, &aacute; thành á ở lượt 2.
const decodeHtml = (s: string) => decodeHtmlEntities(decodeHtmlEntities(s));

async function fetchRawHtml(pageUrl: string): Promise<string> {
  // Web: trình duyệt dính CORS khi fetch HTML báo trực tiếp → đi qua proxy /api/fetch.
  if (Platform.OS === 'web') {
    return (await proxiedFetchText(pageUrl, 8000)) || '';
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(pageUrl, { headers: UA_HEADERS, signal: controller.signal });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

// Vùng nội dung chính của trang: cắt phần trước container bài viết và cắt đuôi
// (comment/tin-liên-quan/footer) để lượt quét <img> khỏi nhặt ảnh sidebar,
// banner QC và thumbnail của bài KHÁC — nguyên nhân chính khiến tóm tắt dính
// ảnh không liên quan.
function extractContentRegion(html: string): string {
  // Tìm container bài viết + mốc kết thúc TRÊN HTML GỐC (không phải chuỗi đã
  // cắt) — nếu tính trên chuỗi đã cắt, trang ngắn làm mốc "related" rơi dưới
  // ngưỡng và ảnh sidebar/tin-liên-quan lọt vào vùng quét.
  const openM = html.match(/<div[^>]+class=["'][^"']*(?:main-content|maincontent|detail-content|content-detail|article-body|article__body|article-content|entry-content|post-content|fck_detail|contentdetail|abody|detail-page|news-content)[^"']*["']/i);
  const start = openM && openM.index !== undefined ? openM.index : 0;
  let end = html.length;
  for (const re of [
    /<div[^>]+class=["'][^"']*(?:comment|binh[-_]luan|related|tin[-_]lien[-_]quan|liên\s*quan|box[-_]category|list[-_]news|footer|wrap[-_]ad|tag[-_]list|author|box[-_]news|box[-_]doc|doc[-_]nhieu|xem[-_]them|read[-_]more|more[-_]news|recommend|sidebar|widget|watch[-_]next|up[-_]next|carousel|slider[-_]news|same[-_]category|top[-_]news|tin[-_]noi[-_]bat|trending)/i,
    /<(?:section|aside|ul)[^>]+(?:id|class)=["'][^"']*(?:related|tin[-_]lien[-_]quan|recommend|read[-_]more|more[-_]news|box[-_]news|footer)/i,
    /<footer[\s>]/i,
  ]) {
    const m = html.match(re);
    if (m && m.index !== undefined && m.index > start + 500) end = Math.min(end, m.index);
  }
  return html.slice(start, end);
}

// Giới hạn số media bóc từ HTML — phòng hờ khi filter lọt rác
const MAX_HTML_MEDIA = 8;

// href trỏ tới BÀI VIẾT KHÁC (khác path với bài đang đọc, bỏ query/anchor —
// gallery /?page=2 vẫn tính là cùng bài). Empty string = không xác định được.
function articlePathDiffers(href: string, pageUrl: string): boolean {
  let target: string;
  try {
    target = new URL(href, pageUrl).href;
  } catch {
    return false;
  }
  const pathOf = (s: string) => s.replace(/^(?:https?:)?\/\//i, '').replace(/^www\./i, '').split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
  const a = pathOf(target);
  const b = pathOf(pageUrl);
  return !!a && !!b && a !== b;
}

// Cache promise HTML thô theo URL — fetchMediaFromHtml + fetchArticleTextFast
// dùng CHUNG một lần fetch HTML (đỡ request trùng, ảnh về cùng tốc độ với text)
const rawHtmlCache = new Map<string, Promise<string>>();
export function fetchRawHtmlCached(pageUrl: string): Promise<string> {
  let p = rawHtmlCache.get(pageUrl);
  if (!p) {
    p = fetchRawHtml(pageUrl);
    rawHtmlCache.set(pageUrl, p);
    if (rawHtmlCache.size > 96) {
      const oldest = rawHtmlCache.keys().next().value as string | undefined;
      if (oldest) rawHtmlCache.delete(oldest);
    }
  }
  return p;
}

async function fetchMediaFromHtml(pageUrl: string): Promise<ArticleBlock[]> {
  const html = await fetchRawHtmlCached(pageUrl);
  if (!html) return [];
  // Quét HTML lớn (0.3-1MB) QUA HÀNG ĐỢI CPU: parseArticleBlocks/fetchMediaFromHtml
  // lúc prefetch (1.2s sau khi content hiện) là nguyên nhân "khựng ~2s" lúc mới
  // launch. runCpuTask tuần tự hoá + nhả thread giữa các job; vòng scan bên dưới
  // còn nhả thread từng ~12ms để touch luôn có kẽ xử lý.
  return runCpuTask(async () => {
  const region = stripSiteWidgets(extractContentRegion(html));

  const out: ArticleBlock[] = [];
  const seenBase = new Set<string>();
  type Mark = { idx: number; block: ArticleBlock };
  const marks: Mark[] = [];
  const push = (idx: number, b: ArticleBlock | null) => {
    if (!b?.url) return;
    const key = baseUrlKey(b.url);
    if (seenBase.has(key)) return;
    seenBase.add(key);
    // pos = tỉ lệ vùng nội dung đứng TRƯỚC media → ArticleScreen xếp đúng chỗ
    marks.push({ idx, block: { ...b, pos: Math.max(idx, 0) / Math.max(region.length, 1) } });
  };

  // Hero: og:image/og:video nằm ở <head> ngoài region — luôn đầu bài như bố cục gốc
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogImage && isEditorialImage(decodeHtml(ogImage[1]))) push(-1, { type: 'image', url: decodeHtml(ogImage[1]), pos: 0 });
  const ogVideo = html.match(/<meta[^>]+property=["']og:video(?::url)?["'][^>]+content=["']([^"']+)["']/i);
  if (ogVideo) push(-1, classifyVideo(decodeHtml(ogVideo[1])));

  // MỘT lượt quét cả ảnh lẫn video TRONG region, sort theo vị trí xuất hiện →
  // thứ tự khớp bố cục bài gốc (ảnh sau đoạn 1, rồi đoạn 2 có video…).
  // Mỗi nhánh bắt đúng 1 group = URL (group 1..5 theo thứ tự khai báo);
  // nhánh img lấy cả tag đầy đủ để bóc alt-text làm caption.
  const mediaRe = new RegExp([
    /<img\s[^>]*?(?:\bsrc|data-src)=["']([^"']+)["'][^>]*>/,
    /data-vid=["']([^"']+)["']/,
    /data-src=["'](https?:\/\/[^"']+\.mp4[^"']*)["']/,
    /(https?:\/\/[^"'\s>\\]+\.m3u8[^"'\s>]*)/,
    /<video[^>]*>\s*<source[^>]+src=["']([^"']+)["']/,
  ].map((r) => `(?:${r.source})`).join('|'), 'gi');

  let m: RegExpExecArray | null;
  let lastYield = Date.now();
  while ((m = mediaRe.exec(region)) !== null) {
    // Regex quét full-HTML có thể chạy hàng trăm ms → nhả thread 1 tick
    // mỗi ~12ms để touch/press luôn có kẽ xử lý
    const now = Date.now();
    if (now - lastYield > 12) {
      lastYield = now;
      await new Promise<void>((r) => setTimeout(r, 0));
    }
    const raw = [m[1], m[2], m[3], m[4], m[5]].find(Boolean);
    if (!raw) continue;
    let u = decodeHtml(raw);
    if (u.startsWith('//')) u = 'https:' + u;
    const isImg = m[1] !== undefined;
    if (!isImg) {
      // Video "tin liên quan" thường bọc trong <a href=bài khác> (widget xem
      // thêm) → kiểm tra link bọc giống ảnh: href trỏ bài KHÁC → bỏ.
      const vbefore = region.slice(Math.max(0, m.index - 800), m.index);
      const vopenA = vbefore.lastIndexOf('<a ');
      if (vopenA > vbefore.lastIndexOf('</a>')) {
        const vhrefM = vbefore.slice(vopenA).match(/\bhref=["']([^"']*)["']/i);
        const vhref = vhrefM ? decodeHtml(vhrefM[1]).trim() : '';
        if (vhref && !/^(?:javascript|data):/i.test(vhref) && articlePathDiffers(vhref, pageUrl)) continue;
      }
      push(m.index, classifyVideo(u));
    } else {
      // Lazyload: <img src="data:image/gif…" data-src/data-original="URL xịn">
      // → src bắt được không phải ảnh thật, thử các attr data-* URL http.
      if (!isEditorialImage(u)) {
        const attr = m[0].match(/(?:data-original|data-large-src|data-src)=["'](https?:\/\/[^"']+)["']/i);
        if (!attr) continue;
        u = decodeHtml(attr[1]);
        if (u.startsWith('//')) u = 'https:' + u;
        if (!isEditorialImage(u)) continue;
      }
      // Ảnh BỌC TRONG <a href="bài KHÁC"> = thumbnail "xem thêm/tin liên quan"
      // (Tiền Phong nhúng nguyên cụm này trong vùng nội dung, alt = tiêu đề bài
      // khác → nếu lọt, tóm tắt hiện ảnh + "caption" sai hoàn toàn). Ảnh nội
      // dung thật: không bọc link, bọc lightbox về CHÍNH ảnh, hoặc link trong
      // cùng trang (gallery ?page=2…).
      const before = region.slice(Math.max(0, m.index - 800), m.index);
      const openA = before.lastIndexOf('<a ');
      if (openA > before.lastIndexOf('</a>')) {
        const hrefM = before.slice(openA).match(/\bhref=["']([^"']*)["']/i);
        const href = hrefM ? decodeHtml(hrefM[1]).trim() : '';
        if (href && !/^(?:javascript|data):/i.test(href)) {
          const isSelfZoom = /\.(jpe?g|png|webp|avif|gif)(\?|#|$)/i.test(href) && sameImageFile(href, u);
          if (!isSelfZoom && articlePathDiffers(href, pageUrl)) continue;
        }
      }
      const rawAlt = (m[0].match(/\balt=["']([^"']*)["']/i) || [])[1];
      // Ảnh quảng cáo/banner → loại hẳn.
      if (rawAlt && AD_ALT_RE.test(rawAlt.trim())) continue;
      // Caption: ƯU TIÊN <figcaption> của <figure> chứa ảnh (canonical trong CMS
      // hiện đại — alt nhiều khi chỉ là tên riêng trần, vd "Châu Bùi" trong khi
      // figcaption là "Châu Bùi và bố tại bản Mường"). Alt placeholder
      // ("Image 5", "Ảnh 1") chỉ bỏ nếu KHÔNG có figcaption — gallery VnE/ANTĐ
      // vẫn giữ ảnh vì caption thật nằm trong figure.
      let cap: string | null = null;
      {
        // Tìm <figcaption> của figure chứa ảnh: nếu ảnh nằm trong <figure> thì
        // quét tới </figure> (không cắt ở <img> kế tiếp — ảnh noscript duplicate
        // cùng figure sẽ che mất figcaption). Ảnh trần (không figure) chỉ lấy
        // caption đứng TRƯỚC <img> kế tiếp — không nuốt caption ảnh khác.
        const figEnd = region.indexOf('</figure>', m.index);
        const nextImg = region.indexOf('<img', m.index + 1);
        const limit = figEnd >= 0
          ? Math.min(figEnd + 15, m.index + 1500)
          : Math.min(nextImg >= 0 ? nextImg : m.index + 900, m.index + 900);
        const seg = region.slice(m.index, Math.max(m.index, limit));
        const fc = seg.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
        if (fc) {
          const text = decodeHtml(fc[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
          if (text.length >= 4 && text.length <= 200 && !AD_ALT_RE.test(text)) cap = text;
        }
      }
      if (!cap && rawAlt && !AUTO_ALT_RE.test(rawAlt.trim())) {
        cap = altToCaption(rawAlt) || null;
      }
      // Không có caption mà alt cũng là placeholder thuần ("Image 5") → ảnh UI/
      // carousel, không phải ảnh bài viết → bỏ.
      if (!cap && rawAlt && AUTO_ALT_RE.test(rawAlt.trim())) continue;
      push(m.index, { type: 'image', url: u, ...(cap ? { caption: cap } : {}) });
    }
  }

  marks.sort((a, b) => a.idx - b.idx);
  for (const mk of marks) {
    out.push(mk.block);
    if (out.length >= MAX_HTML_MEDIA) break;
  }
  return out;
  });
}

// Chỉ lấy media (ảnh/video) từ HTML bài gốc — NHANH, không chờ Jina. Dùng để
// hiện ảnh cùng lúc với tóm tắt; Jina text về sau sẽ thay thế blocks đầy đủ.
// Cache in-memory media HTML theo URL: fetchArticleMedia (fast path) và
// loadArticleContent (Jina) đều gọi fetchMediaFromHtml — cache tránh fetch HTML
// TRÙNG 2 lần, rút ngắn thời gian ảnh xuất hiện.
const mediaHtmlCache = new Map<string, Promise<ArticleBlock[]>>();

export async function fetchArticleMedia(url: string): Promise<ArticleBlock[]> {
  const hit = mediaHtmlCache.get(url);
  if (hit) return hit;
  const p = fetchMediaFromHtml(url).catch(() => [] as ArticleBlock[]);
  mediaHtmlCache.set(url, p);
  return p;
}

// TEXT bài viết bóc thẳng từ HTML trang báo — NGUỒN NHANH cho summarize.
// Jina (r.jina.ai render headless) mất 10-20s mới trả markdown đầy đủ; trong
// khi HTML gốc (server-side render của các báo VN) về ~1-2s và app vốn đã
// fetch nó để lấy ảnh. Dùng cho bước "nâng cấp summary full-text" để không
// phải chờ Jina; Jina vẫn về sau để render bài + caption/media chuẩn.
export async function fetchArticleTextFast(url: string): Promise<string> {
  const html = await fetchRawHtmlCached(url).catch(() => '');
  if (!html) return '';
  const region = stripSiteWidgets(extractContentRegion(html));
  if (region.length < 500) return '';
  const text = await runCpuTask(() => htmlRegionToText(region));
  return text.length >= LIMITS.articleMinLength ? text : '';
}

function htmlRegionToText(region: string): string {
  let s = region
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(title|svg|iframe|form|select|button)[\s\S]*?<\/\1>/gi, ' ')
    // tag block → dòng mới để câu không dính liền nhau
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote|br|tr|figcaption)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodeHtml(s)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  // bài thật thường vài nghìn ký tự; giữ trần 12k — đủ ý chính, bớt rác prefill
  return s.length > 12000 ? s.slice(0, 12000) : s;
}

// Hỏi proxy lấy stream HLS nhúng trong trang. Không có proxy / lỗi / không
// thấy stream → null (im lặng, article vẫn đọc bình thường).
async function fetchEmbeddedVideo(pageUrl: string): Promise<ArticleBlock | null> {
  const proxyUrl = getProxyBase();
  if (!proxyUrl) return null;
  try {
    const res = await fetch(`${proxyUrl}/api/article-stream?url=${encodeURIComponent(pageUrl)}`);
    if (!res.ok) return null;
    const { stream } = await res.json();
    if (!stream || !/\.m3u8(\?|#|$)/i.test(stream)) return null;
    return { type: 'video', url: stream, kind: 'file' };
  } catch {
    return null;
  }
}

// Jina Reader: fetch nội dung bài, trả về block text/ảnh/video.
// Ưu tiên qua proxy local (không dính CORS + có retry khi Jina 503);
// proxy tắt/không tới được → gọi thẳng r.jina.ai (native không bị CORS).
// ----- Content cache + prefetch -----
// Cache in-memory kết quả fetch bài theo URL: mở lại bài = tức thì, và
// prefetchArticleContent() cho phép HomeScreen tải sẵn bài đang hiện trên màn hình.
const contentCache = new Map<string, Promise<ArticleBlock[]>>();
const CONTENT_CACHE_MAX = 24;

export function prefetchArticleContent(url: string, item?: FeedItem): void {
  if (!url || contentCache.has(url)) return;
  // Trang video: không có bài văn để tóm — prefetch không có ích, bỏ (không tốn LLM).
  if (isVideoPageUrl(url)) return;
  // E2E: mockNetwork toàn bộ, prefetch chỉ làm nhiễu cache (lưu kết quả giả mặc
  // định trước khi test kịp override route) → bỏ qua.
  if ((typeof window !== 'undefined' && (window as any).__E2E__)) return;
  if (contentCache.size >= CONTENT_CACHE_MAX) {
    const oldest = contentCache.keys().next().value as string | undefined;
    if (oldest) contentCache.delete(oldest);
  }
  // Start pre-summarize với text nhanh bóc từ HTML bài gốc (~1-2s) — trước đây
  // pend bị Jina (10-20s) chắn trước nên mở bài sớm chẳng được gì. HTML này
  // dùng chung cache với lượt fetch media → KHÔNG thêm request mạng.
  if (item) {
    void fetchArticleTextFast(url).then((t) => preSummarizeSrc(item, t)).catch(() => {});
  }
  // Fail → tự xóa khỏi cache để lần sau retry, không kẹt [] vĩnh viễn
  const p = loadArticleContent(url)
    .then((blocks) => {
      if (item) preSummarize(item, blocks);
      return blocks;
    })
    .catch((e) => { contentCache.delete(url); throw e; });
  contentCache.set(url, p);
  // Prefetch chạy nền, KHÔNG ai await p → rejection thành "Uncaught (in promise)"
  // với bài rác/video ("Bài báo quá ngắn..."). Nhánh catch no-op đánh dấu p đã
  // được handle; người mở bài thật vẫn nhận lỗi qua fetchArticleContent(p).
  p.catch(() => {});
}

// ----- Tóm tắt trước (pre-summarize) nền -----
// HomeScreen prefetch bài nào → summarize ngay bằng FULL TEXT vừa tải + ghi
// history. Người dùng mở bài → history hit → tóm tắt hiện TỨC THÌ (độ trễ ~0ms,
// không chờ LLM). Bài chưa kịp xong khi mở → peekPendingSummary() để await chứ
// không gọi LLM trùng lần hai.
const summaryInflight = new Map<string, Promise<string>>();

export function peekPendingSummary(url: string): Promise<string> | undefined {
  return summaryInflight.get(url);
}

// Summary cũ từ trước khi fix (metadata lọt, fragment, dấu vết markdown) vẫn nằm
// trong history cache → mở lại bài vẫn thấy bản "lạ". Phát hiện + purge để tóm lại.
export function isStaleSummary(s: string): boolean {
  if (!s) return false;
  const lines = s.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return false;
  // Quá dài (>12 dòng) = summary cũ chứa cả bài/related của báo → tóm lại
  if (lines.length > 12) return true;
  // Dòng còn dấu vết markdown ảnh/link, hoặc kết thúc "…" (caption cụt)
  if (lines.some((l) => /\]\(/i.test(l) || /…$|\.\.\.$/.test(l))) return true;
  const first = lines[0];
  // Dòng đầu còn label "TL;DR" / "Tóm tắt:" → summary cũ chưa được làm sạch
  if (/^TL;?DR\s*[:：—-]?/i.test(first)) return true;
  if (/^Tóm\s*tắt\s*[:：—-]/i.test(first)) return true;
  // Dòng đầu là chuyên mục / ngày giờ / ghi chú ảnh / fragment chữ thường
  if (/^(?:ảnh|hình|photo)\s*[:：]/i.test(first)) return true;
  if (/^nhóm\s+phóng\s+viên/i.test(first)) return true;
  if (/^\d{1,2}[\/:]\d{1,2}(?:\/\d{2,4})?|\b\d{1,2}:\d{2}\b|^Thứ\s+\w+[,:]/i.test(first)) return true;
  const c = first.charAt(0);
  return !!c && c.toLowerCase() === c && c !== c.toUpperCase();
}

export async function saveSummaryToHistory(item: FeedItem, summary: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.history);
    const history: SummaryRecord[] = raw ? JSON.parse(raw) : [];
    const next = history.filter((h) => h.url !== item.link); // dedupe — bản mới nhất thắng
    next.unshift({
      url: item.link, title: item.title, summary, date: new Date().toISOString(), source: item.source,
    });
    await AsyncStorage.setItem(KEYS.history, JSON.stringify(next.slice(0, LIMITS.historyMax)));
  } catch { /* history hỏng thì bỏ qua, không chặn UX */ }
}

function startSummaryFor(item: FeedItem, src: string): Promise<string> {
  const existing = summaryInflight.get(item.link);
  if (existing) return existing;
  const p = summarizeArticle(src, item.category)
    .then((s) => {
      summaryInflight.delete(item.link);
      if (s && s.trim().length >= 20 && !isStaleSummary(s)) void saveSummaryToHistory(item, s);
      return s;
    })
    .catch((e) => {
      summaryInflight.delete(item.link);
      throw e;
    });
  summaryInflight.set(item.link, p);
  return p;
}

function preSummarize(item: FeedItem, blocks: ArticleBlock[]): void {
  preSummarizeSrc(item, blocksToText(blocks) || item.description || '');
}

// src = text bài (HTML nhanh từ prefetch, hoặc full-text Jina). Guard dedupe
// theo link: lượt HTML chạy trước → lượt Jina sau tự bỏ (history đã có bản tốt).
function preSummarizeSrc(item: FeedItem, src: string): void {
  if (typeof window !== 'undefined' && (window as any).__E2E__) return;
  if (summaryInflight.has(item.link)) return;
  if (src.length < 200) return; // bài quá ngắn/rác → mặc màn hình mở bài tự xử
  void (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.history);
      const history: SummaryRecord[] = raw ? JSON.parse(raw) : [];
      const hit = history.find((h) => h.url === item.link);
      if (hit && !isStaleSummary(hit.summary)) return; // đã có summary tốt → khỏi tốn LLM
    } catch { /* tính cả khi đọc history lỗi */ }
    startSummaryFor(item, src).catch(() => {});
  })();
}

export async function fetchArticleContent(url: string): Promise<ArticleBlock[]> {
  const hit = contentCache.get(url);
  if (hit) return hit;
  // Cache result của chính lần fetch này (kể cả E2E — prefetch bị guard bỏ qua
  // ở Home, nhưng mở bài phải được cache để "Quay lại → mở lại" không gọi Jina
  // lần hai). Fail → tự xóa để lần sau retry.
  if (contentCache.size >= CONTENT_CACHE_MAX) {
    const oldest = contentCache.keys().next().value as string | undefined;
    if (oldest) contentCache.delete(oldest);
  }
  const p = loadArticleContent(url).catch((e) => { contentCache.delete(url); throw e; });
  contentCache.set(url, p);
  return p;
}

async function loadArticleContent(url: string): Promise<ArticleBlock[]> {
  const jinaHeaders = {
    'Accept': 'text/markdown',
    'X-Remove-Selector': 'header, nav, footer, aside, .header, .nav, .footer, .sidebar, .menu, [role="navigation"], [role="banner"]',
  };

  // Chạy SONG SONG Jina + HTML media fallback để media xuất hiện cùng lúc với
  // text tóm tắt, không đợi xong Jina mới fetch HTML. Media HTML dùng chung
  // cache với fetchArticleMedia → không fetch trùng 2 lần.
  const mediaHtmlPromise = fetchArticleMedia(url);

  // Jina qua proxy local — failover qua các candidate base (cùng origin → IP
  // Metro → loopback). Base chết (IP cũ sau khi đổi Wi-Fi) bị skip sau lần đầu.
  let raw = '';
  for (const base of orderedProxyBases()) {
    try {
      const res = await fetch(`${base}/api/jina?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) {
        // Proxy TRẢ LỜI = còn sống; non-ok là lỗi upstream (Jina 4xx/502 "failed
        // after retries"). markDead ở đây đầu độc base khỏe → request sau rơi vào
        // IP LAN cũ → timeout dây dưa. Vẫn continue để thử base kế (Jina có thể
        // chết tạm), nhưng không cấm base này.
        markProxyAlive(base);
        continue;
      }
      markProxyAlive(base);
      raw = await res.text();
      break;
    } catch {
      markProxyDead(base);
      continue;
    }
  }
  if (!raw) {
    const res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, { headers: jinaHeaders });
    if (!res.ok) throw new Error(`Không thể đọc bài báo (HTTP ${res.status})`);
    raw = await res.text();
  }
  const blocks = await parseArticleBlocksAsync(raw, url);
  // Trang video: player JS giấu stream khỏi Jina → bóc m3u8 từ HTML, chèn lên
  // đầu (video chính là lead của trang dạng này). Chỉ gọi khi chưa thấy video.
  if (!blocks.some((b) => b.type === 'video') && isVideoPageUrl(url)) {
    const v = await fetchEmbeddedVideo(url);
    if (v) blocks.unshift(v);
  }

  // Gộp media từ HTML fallback CHỈ KHI Jina gần như không bắt được media nào
  // (trang chặn Jina / lazy-load). Mỗi media giữ pos riêng (vị trí trong HTML)
  // → ArticleScreen tự xếp theo bố cục bài gốc; KHÔNG rải đều vì rải làm mất
  // thứ tự thật của ảnh/video.
  const mediaHtml = await mediaHtmlPromise;
  const jinaMediaCount = blocks.filter((b) => b.type === 'image' || b.type === 'video').length;
  if (jinaMediaCount < 2) {
    const existingBase = new Set(blocks.filter((b) => b.url).map((b) => baseUrlKey(b.url!)));
    for (const mb of mediaHtml) {
      if (!mb.url || existingBase.has(baseUrlKey(mb.url))) continue;
      existingBase.add(baseUrlKey(mb.url));
      blocks.push(mb);
    }
  }
// BACKFILL caption: nhiều báo (ANTĐ trang gallery, VietnamNet…) để Jina gộp
  // alt về "Image N" trần — caption THẬT chỉ còn trong <figcaption> của HTML.
  // Khớp theo FILE ảnh (sameImageFile) để kéo caption vào ảnh Jina chưa có caption.
  if (mediaHtml.length) {
    for (const b of blocks) {
      if (b.type !== 'image' || !b.url) continue;
      const src = mediaHtml.find((mb) => mb.url && mb.caption && sameImageFile(mb.url, b.url!));
      if (src?.caption) b.caption = src.caption;
    }
  }

  if (blocksToText(blocks).length < LIMITS.articleMinLength && !blocks.some((b) => b.type === 'image' || b.type === 'video')) {
    throw new Error('Bài báo quá ngắn hoặc không có nội dung');
  }
  return blocks;
}

import { LIMITS } from './storage';

// ----- Nén caption ảnh dài bằng AI -----
// Caption figcaption/alt của báo có thể 120-200 ký tự → UI 2 dòng không đủ.
// Thay vì cắt "…", gửi TẤT CẢ caption dài trong MỘT request batch, cache theo
// URL ảnh (mở lại bài = 0 lời gọi). AI chết → giữ caption gốc (lặng lẽ).
export const CAPTION_AI_MAX = 88;

const captionAIcache = new Map<string, string>(); // baseUrlKey → caption đã nén
const captionAIpending = new Set<string>();

export function getCachedCaption(url: string): string | undefined {
  return captionAIcache.get(baseUrlKey(url));
}

export async function aiCondenseCaptions(
  items: { url: string; caption: string }[],
): Promise<number> {
  const todo = items.filter((it) =>
    it.caption.length > CAPTION_AI_MAX
    && !captionAIcache.has(baseUrlKey(it.url))
    && !captionAIpending.has(baseUrlKey(it.url)),
  );
  if (!todo.length) return 0;
  todo.forEach((t) => captionAIpending.add(baseUrlKey(t.url)));
  try {
    const provider = DEFAULT_PROVIDER;
    const cfg = getProviderConfig(provider);
    if (!cfg) return 0;
    const apiKey = (await AsyncStorage.getItem(KEYS[cfg.keyStorageKey])) || DEFAULT_NVIDIA_KEY;
    const storedModel = await AsyncStorage.getItem(KEYS.model);
    const model = (storedModel && cfg.models.some((m) => m.id === storedModel) ? storedModel : cfg.models[0]?.id) || '';
    const list = todo.map((t, i) => `${i + 1}. ${t.caption}`).join('\n');
    const prompt = `Bạn là biên tập viên ảnh của tòa soạn. Viết lại mỗi chú thích ảnh dưới đây thành bản NGẮN (tối đa 12 từ), tiếng Việt, trọn nghĩa.\nQuy tắc: giữ đúng tên riêng/địa danh và credit nguồn ("Ảnh: ..."); không bịa thêm; giữ nguyên dấu "=" giữa tên phim và credit nếu có; trả về ĐÚNG ${todo.length} dòng theo thứ tự, mỗi dòng chỉ chứa chú thích đã rút gọn, không số thứ tự, không giải thích.\n\n${list}`;
    const { url, headers, body } = buildLlmRequest(provider, apiKey || '', model, prompt, list, 220);
    const data = await sendLlmRequest(url, headers, body, provider, cfg.label, 20000);
    const raw = data.choices?.[0]?.message?.content || '';
    const lines = raw
      .split(/\r?\n/)
      .map((l: string) => l.replace(/^\s*\d+[.):\-]\s*/, '').replace(/^["“«](.*)["”»]$/, '$1').trim())
      .filter(Boolean);
    let stored = 0;
    todo.forEach((t, i) => {
      const s = lines[i];
      if (s && s.length >= 4 && s.length < t.caption.length) {
        captionAIcache.set(baseUrlKey(t.url), s);
        stored++;
      }
    });
    return stored;
  } catch {
    return 0; // thất bại → caption gốc, không lỗi UI
  } finally {
    todo.forEach((t) => captionAIpending.delete(baseUrlKey(t.url)));
  }
}