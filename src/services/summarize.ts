// Multi-LLM provider support (OpenAI-compatible endpoints + Anthropic + Google)
// ponytail: unified interface, minimal branching

import { Platform } from 'react-native';
import { KEYS } from './storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProxyBase, orderedProxyBases, markProxyDead, markProxyAlive, proxiedFetchText } from '../utils/proxy';

export type LLMProvider = 'nvidia' | 'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom';

// Mặc định NVIDIA NIM — app chạy được ngay khi start, không cần vào Settings nhập key.
// User nhập key khác trong Settings sẽ ghi đè (AsyncStorage ưu tiên hơn).
export const DEFAULT_NVIDIA_KEY = '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';

export interface ProviderConfig {
  id: LLMProvider;
  label: string;
  baseUrl: string;
  models: { id: string; label: string }[];
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
    models: [
      { id: 'meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B (nhanh, miễn phí)' },
      { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', label: 'Nemotron 3.5 Lightning 30B (nhanh, miễn phí)' },
      { id: 'mistralai/mistral-7b-instruct-v0.3', label: 'Mistral 7B (nhanh)' },
      { id: 'google/gemma-3-12b-it', label: 'Gemma 3 12B' },
      { id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', label: 'Nemotron Super 49B (miễn phí)' },
      { id: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (mạnh)' },
      { id: 'nvidia/nemotron-3-super-120b-a12b', label: 'Nemotron 3 Super 120B (mạnh, miễn phí)' },
      { id: 'mistralai/mistral-large-2-instruct', label: 'Mistral Large 2 (mạnh nhất)' },
    ],
    needsKey: true,
    keyStorageKey: 'apiKey',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini (rẻ, nhanh)' },
      { id: 'gpt-4o', label: 'GPT-4o (mạnh)' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
    ],
    needsKey: true,
    keyStorageKey: 'openaiKey',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (nhanh, rẻ)' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (cân bằng)' },
      { id: 'claude-opus-5', label: 'Claude Opus 5 (mạnh nhất)' },
    ],
    needsKey: true,
    keyStorageKey: 'anthropicKey',
  },
  {
    id: 'google',
    label: 'Google (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (nhanh, free tier)' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (nhanh nhất, free tier)' },
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (mới, free tier)' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (mạnh)' },
    ],
    needsKey: true,
    keyStorageKey: 'googleKey',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 Lightning (free)' },
      { id: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'Nemotron 3 Nano 30B (free)' },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super 120B (free)' },
      { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra 550B (free, mạnh)' },
      { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (free)' },
      { id: 'z-ai/glm-5.2:free', label: 'GLM 5.2 (free)' },
      { id: 'openai/gpt-oss-20b:free', label: 'gpt-oss-20b (free)' },
      { id: 'liquid/lfm-2.5-2.6b:free', label: 'LFM 2.5 2.6B (free, rất nhanh)' },
      { id: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B' },
      { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5' },
      { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
      { id: 'openai/gpt-4o', label: 'GPT-4o' },
    ],
    needsKey: true,
    keyStorageKey: 'openrouterKey',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    models: [{ id: 'auto', label: 'Tự động (model server)' }],
    needsKey: true,
    keyStorageKey: 'customKey',
    supportsCustomUrl: true,
  },
];

export function getProviderConfig(provider: LLMProvider): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === provider);
}

export function getModelsForProvider(provider: LLMProvider): { id: string; label: string }[] {
  return getProviderConfig(provider)?.models || [];
}

// Legacy export for backward compat
export const NIM_MODELS = getModelsForProvider('nvidia');

// Dựng request theo từng provider (endpoint + kiểu auth khác nhau)
function buildLlmRequest(
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

  const baseUrl = provider === 'custom' ? (customBaseUrl || '') : cfg.baseUrl;
  if (!baseUrl) throw new Error('Dịch vụ AI tạm thời không khả dụng, thử lại sau');

  // Build request based on provider type
  const isAnthropic = provider === 'anthropic';
  const isGoogle = provider === 'google';

  let url: string;
  let headers: Record<string, string>;
  let body: any;

  if (isAnthropic) {
    // Anthropic Messages API (not OpenAI-compatible)
    url = `${baseUrl}/messages`;
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    body = {
      model,
      max_tokens: maxTokens,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    };
  } else if (isGoogle) {
    // Google Gemini via OpenAI-compatible endpoint
    url = `${baseUrl}/chat/completions?key=${apiKey}`;
    headers = { 'Content-Type': 'application/json' };
    body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    };
  } else {
    // OpenAI-compatible (NVIDIA, OpenAI, OpenRouter, Custom)
    url = `${baseUrl}/chat/completions`;
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://newssummarizer.app';
      headers['X-Title'] = 'NewsSummarizer';
    }
    body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    };
  }
  return { url, headers, body };
}

// Gửi request — web đi qua proxy local (server/proxy.js) khi provider không có CORS.
// Failover qua các candidate base (cùng origin → IP Metro → loopback), mỗi base một
// attempt với header-timeout riêng: base chết (IP cũ/firewall) không chặn base sau.
// timeoutMs chỉ dùng cho test kết nối; summarize không đặt (bài dài có thể chậm).
async function sendLlmRequest(
  url: string,
  headers: Record<string, string>,
  body: any,
  provider: LLMProvider,
  label: string,
  timeoutMs?: number,
): Promise<any> {
  const isWeb = Platform.OS === 'web';

  // Providers that support CORS natively on web
  const supportsCorsNatively = ['openrouter', 'google'];
  const useNativeCors = isWeb && supportsCorsNatively.includes(provider);

  // Web + provider không có CORS → bắt buộc qua proxy. Danh sách base đã sắp
  // sẵn theo sức khỏe (base sống đầu tiên); mảng rỗng = gọi thẳng.
  const proxyBases = isWeb && !useNativeCors ? orderedProxyBases() : [''];
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

// Gợi ý riêng theo chuyên mục — FeedItem đã mang category từ RSS
const CATEGORY_PROMPT_HINTS: Record<string, string> = {
  'Thể thao': 'Ưu tiên tỉ số, lượt đi/lượt về, tên cầu thủ và HLV liên quan.',
  'Kinh doanh': 'Ưu tiên số liệu tài chính, doanh thu, dự báo và kết luận thị trường.',
  'Công nghệ': 'Ưu tiên tên sản phẩm/thiết bị, thông số nổi bật và giá bán nếu có.',
  'Sức khỏe': 'Ưu tiên triệu chứng và khuyến cáo từ chuyên môn; KHÔNG đưa chẩn đoán hay cách chữa cụ thể.',
  'Giải trí': 'Ưu tiên tên nghệ sĩ, tác phẩm và sự kiện chính.',
};

// Core: summarize via any OpenAI-compatible or Anthropic/Google endpoint.
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
): Promise<string> {
  const hint = (category && CATEGORY_PROMPT_HINTS[category]) || '';
  const prompt = `Bạn là biên tập viên tin tức. Tóm tắt bài báo dưới đây bằng tiếng Việt, trả về ĐÚNG cấu trúc sau — không tiêu đề, không giải thích, không markdown:

Dòng 1: TL;DR — đúng MỘT câu nêu sự kiện chính (dưới 25 từ).
Tiếp theo: 4-6 dòng, mỗi dòng một ý chính theo trình tự bài (diễn biến → nguyên nhân → ý nghĩa), mỗi ý 1-2 câu viết dạng văn xuôi.
Cuối cùng: 2-4 dòng bắt đầu bằng "• " liệt kê DỮ KIỆN cụ thể (số liệu, tên riêng, thời gian, địa điểm). Chỉ lấy thông tin CÓ TRONG bài.

${hint ? `Lưu ý chuyên mục ${category}: ${hint}\n` : ''}Quy tắc: giữ nguyên số liệu/tên riêng/thời gian; KHÔNG bịa thông tin không có trong bài; các dòng cách nhau bằng dòng trống.`;

  const cfg = getProviderConfig(provider);
  if (!cfg) throw new Error('Dịch vụ AI tạm thời không khả dụng, thử lại sau');

  // Cắt input quá dài → model tập trung vào phần đầu (thường chứa ý chính),
  // giảm chi phí/latency và hạn chế bản tóm tắt lan man.
  const MAX_INPUT_CHARS = 4000;
  const inputText = articleText.length > MAX_INPUT_CHARS
    ? articleText.slice(0, MAX_INPUT_CHARS) + '\n…(phần sau đã cắt)'
    : articleText;

  const { url, headers, body } = buildLlmRequest(provider, apiKey, model, prompt, inputText, 480, customBaseUrl);
  const data = await sendLlmRequest(url, headers, body, provider, cfg.label);

  // Parse response based on provider
  const raw = provider === 'anthropic'
    ? data.content?.[0]?.text || ''
    : data.choices?.[0]?.message?.content || '';
  return normalizeStructuredSummary(raw);
}

// Làm sạch output model về đúng format chuẩn:
// bỏ label ("TL;DR:", "Tóm tắt:"...), markdown residue, dòng trùng;
// thống nhất bullet về "• "; giới hạn ≤7 dòng chính + ≤4 dữ kiện.
export function normalizeStructuredSummary(raw: string): string {
  let lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines = lines
    .map((l) => l
      .replace(/^#{1,4}\s*/, '')
      .replace(/^\*\*(.+?)\*\*\s*:?\s*$/, '$1')
      .replace(/^(?:TL;?DR|Tóm\s*tắt|Ý\s*chính|Dữ\s*kiện(?:\s*chính)?|Nội\s*dung(?:\s*chính)?|Chính)\s*:\s*/i, '')
      .trim())
    .filter(Boolean)
    .map((l) => l.replace(/^[-*–—]\s+/, '• ').replace(/^•\s*/, '• '))
    .filter((l) => !/^(?:bài\s*báo|bài\s*viết)\s*(?:này|trên)/i.test(l) || l.length > 40); // bỏ dòng mở đầu kiểu "Bài báo này nói về..."
  if (!lines.length) return '';
  const seen = new Set<string>();
  lines = lines.filter((l) => { const k = l.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  const facts = lines.filter((l) => l.startsWith('•')).slice(0, 4);
  const mains = lines.filter((l) => !l.startsWith('•')).slice(0, 7);
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
  const text = provider === 'anthropic' ? data.content?.[0]?.text : data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Dịch vụ AI trả về phản hồi rỗng');
}

// High-level: fetch key + model from storage, then summarize
export async function summarizeArticle(articleText: string, category?: string): Promise<string> {
  const provider = (await AsyncStorage.getItem(KEYS.provider)) as LLMProvider || 'nvidia';
  const cfg = getProviderConfig(provider);
  if (!cfg) throw new Error('Dịch vụ AI tạm thời không khả dụng, thử lại sau');

  let apiKey = await AsyncStorage.getItem(cfg.keyStorageKey);
  if (!apiKey && provider === 'nvidia') apiKey = DEFAULT_NVIDIA_KEY; // default sẵn, chạy ngay khi start
  if (!apiKey && cfg.needsKey) throw new Error('Dịch vụ AI tạm thời không khả dụng, thử lại sau');

  const model = provider === 'custom'
    ? (await AsyncStorage.getItem(KEYS.customBaseUrl)) // custom uses model from storage too
    : (await AsyncStorage.getItem(KEYS.model)) || cfg.models[0]?.id;

  const customBaseUrl = provider === 'custom' ? await AsyncStorage.getItem(KEYS.customBaseUrl) : undefined;

  return summarizeWithProvider(articleText, provider, apiKey || '', model || cfg.models[0]?.id, customBaseUrl || undefined, category);
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
  const c = decodeHtml(alt).replace(/\s+/g, ' ').trim();
  if (c.length < 4 || c.length > 140) return undefined;
  if (AD_ALT_RE.test(c)) return undefined;
  if (/^(?:image|hình|ảnh|photo)\s*\d+$/i.test(c)) return undefined;
  if (/https?:\/\//i.test(c)) return undefined;
  return c;
}

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
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)([^*_\n]+)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s*(?:[*+-]|\d+[.)])[ \t]+/gm, '')
    .replace(/^[ \t]*\[[ xXoO]?\][ \t]*/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  'admicro', 'vcmedia', 'zingads', 'eclick.', 'adasia', 'avplayer.com',
  'gliastudios', 'adnetwork', 'adserver', 'adsys.',
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
    // Filter thumbnail suffixes: -thumb, _thumb, -small, _small, -preview, _preview
    if (/(-|_)(thumb|small|preview|teaser|crop)\d*(\/|_|-|\.|$)/i.test(url)) return false;
    // Chỉ chặn avatar vuông nhỏ (w=h<=100). Không chặn ảnh nội dung tỷ lệ ngang/dọc
    // vì Jina giữ nguyên tham số w/h của site gốc (VD VnExpress dùng ?w=300&h=180).
    const wParam = url.match(/[?&](?:w|width)=(\d+)/i);
    const hParam = url.match(/[?&](?:h|height)=(\d+)/i);
    if (wParam && hParam) {
      const w = +wParam[1], h = +hParam[1];
      if (w > 0 && h > 0 && w <= 100 && h <= 100) return false;
    }
    // Filter 1x1, 2x2 tracking pixels
    if (/[?&](w|width)=[12]&?(h|height)=[12]/i.test(url)) return false;
    // Ad/tracking pixel đội lốt ảnh (vd cl.vlitag.com/tf-v1.jpeg?e=...): query
    // rất dài, không có tham số kích thước như ảnh CDN thật.
    const qIdx = url.indexOf('?');
    if (qIdx >= 0 && url.length - qIdx > 150 && !/[?&](w|width|h|height)=/i.test(url)) return false;
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

// Parse markdown → mảng block giữ nguyên vị trí text/ảnh/video (để render xen kẽ "dưới mỗi text").
export function parseArticleBlocks(raw: string): ArticleBlock[] {
  const s = stripJinaHeader(raw);
  const blocks: ArticleBlock[] = [];

  // Đánh dấu vị trí ảnh và video trong text
  const markers: { index: number; end: number; block: ArticleBlock }[] = [];
  const seenBase = new Set<string>(); // dedupe theo base URL — VnExpress trả ảnh ~2 lần với ?w= khác nhau
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m;
  while ((m = imgRe.exec(s)) !== null) {
    if (isAdHost(m[2])) continue;
    if (m[1] && AD_ALT_RE.test(m[1].trim())) continue;
    if (!isEditorialImage(m[2])) continue;
    // Ảnh bị bọc trong link [![alt](img.jpg)](...): thumbnail "tin liên quan/
    // đọc nhiều" (link bài viết) hoặc banner QC (link trỏ ảnh khác, vd
    // [![QC Xi măng](qc.jpg)](longson.jpg)). Chỉ giữ khi link trỏ đến CHÍNH
    // ảnh đó (zoom to) — so base URL không query.
    if (s[m.index - 1] === '[' && s.startsWith('](', m.index + m[0].length)) {
      const close = s.indexOf(')', m.index + m[0].length + 2);
      const wrapUrl = close >= 0 ? s.slice(m.index + m[0].length + 2, close) : '';
      const wrapHref = wrapUrl.split(/\s/)[0]; // markdown: URL có thể kèm "title"
      if (wrapHref.split('?')[0] !== m[2].split('?')[0]) continue;
    }
    const baseKey = baseUrlKey(m[2]);
    if (seenBase.has(baseKey)) continue;
    seenBase.add(baseKey);
    const cap = altToCaption(m[1]);
    markers.push({ index: m.index, end: m.index + m[0].length, block: { type: 'image', url: m[2], pos: m.index / Math.max(s.length, 1), ...(cap ? { caption: cap } : {}) } });
  }
  // Site lazy-load / tối ưu SEO → Jina giữ <img src="..."> raw thay vì ![alt](url). Bắt cả 2 định dạng.
  const htmlImgRe = /<img\s[^>]*>/gi;
  while ((m = htmlImgRe.exec(s)) !== null) {
    const tag = m[0];
    const um = tag.match(/(?:\bsrc|data-src)=["']([^"']+)["']/i);
    const url = um?.[1];
    if (!url || isAdHost(url)) continue;
    if (!isEditorialImage(url)) continue;
    const baseKey = baseUrlKey(url);
    if (seenBase.has(baseKey)) continue;
    seenBase.add(baseKey);
    const cap = altToCaption((tag.match(/\balt=["']([^"']*)["']/i) || [])[1]);
    markers.push({ index: m.index, end: m.index + tag.length, block: { type: 'image', url, pos: m.index / Math.max(s.length, 1), ...(cap ? { caption: cap } : {}) } });
  }
  // Chỉ bắt link/video có pattern YouTube, Vimeo, hoặc đuôi file video - bỏ qua link bài báo khác
  const vidRe = /\[[^\]]*\]\((https?:\/\/(?:youtu\.be|youtube\.com|vimeo\.com|[^)]+\.(?:mp4|webm|mov|ogv))[^)]*)\)|(https?:\/\/(?:youtu\.be|youtube\.com|vimeo\.com|[^\s)\]]+\.(?:mp4|webm|mov|ogv)))/gi;
  while ((m = vidRe.exec(s)) !== null) {
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
  for (const mk of markers) {
    if (mk.index < last) continue;
    const text = scrubAdLines(cleanMarkdownText(s.slice(last, mk.index)));
    if (text) blocks.push({ type: 'text', text });
    blocks.push(mk.block);
    last = mk.end;
  }
  const rest = scrubAdLines(cleanMarkdownText(s.slice(last)));
  if (rest) blocks.push({ type: 'text', text: rest });
  return blocks;
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

const decodeHtml = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

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
    /<div[^>]+class=["'][^"']*(?:comment|binh[-_]luan|related|tin[-_]lien[-_]quan|box[-_]category|list[-_]news|footer|wrap[-_]ad|tag[-_]list|author)/i,
    /<footer[\s>]/i,
  ]) {
    const m = html.match(re);
    if (m && m.index !== undefined && m.index > start + 500) end = Math.min(end, m.index);
  }
  return html.slice(start, end);
}

// Giới hạn số media bóc từ HTML — phòng hờ khi filter lọt rác
const MAX_HTML_MEDIA = 8;

async function fetchMediaFromHtml(pageUrl: string): Promise<ArticleBlock[]> {
  const html = await fetchRawHtml(pageUrl);
  if (!html) return [];
  const region = extractContentRegion(html);

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
  while ((m = mediaRe.exec(region)) !== null) {
    const raw = [m[1], m[2], m[3], m[4], m[5]].find(Boolean);
    if (!raw) continue;
    let u = decodeHtml(raw);
    if (u.startsWith('//')) u = 'https:' + u;
    const isImg = m[1] !== undefined;
    if (!isImg) {
      push(m.index, classifyVideo(u));
    } else {
      if (!isEditorialImage(u)) continue;
      const cap = altToCaption((m[0].match(/\balt=["']([^"']*)["']/i) || [])[1]);
      push(m.index, { type: 'image', url: u, ...(cap ? { caption: cap } : {}) });
    }
  }

  marks.sort((a, b) => a.idx - b.idx);
  for (const mk of marks) {
    out.push(mk.block);
    if (out.length >= MAX_HTML_MEDIA) break;
  }
  return out;
}

// Chỉ lấy media (ảnh/video) từ HTML bài gốc — NHANH, không chờ Jina. Dùng để
// hiện ảnh cùng lúc với tóm tắt; Jina text về sau sẽ thay thế blocks đầy đủ.
export async function fetchArticleMedia(url: string): Promise<ArticleBlock[]> {
  return fetchMediaFromHtml(url).catch(() => [] as ArticleBlock[]);
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

export function prefetchArticleContent(url: string): void {
  if (!url || contentCache.has(url)) return;
  if (contentCache.size >= CONTENT_CACHE_MAX) {
    const oldest = contentCache.keys().next().value as string | undefined;
    if (oldest) contentCache.delete(oldest);
  }
  // Fail → tự xóa khỏi cache để lần sau retry, không kẹt [] vĩnh viễn
  const p = loadArticleContent(url).catch((e) => { contentCache.delete(url); throw e; });
  contentCache.set(url, p);
}

export async function fetchArticleContent(url: string): Promise<ArticleBlock[]> {
  const hit = contentCache.get(url);
  if (hit) return hit;
  prefetchArticleContent(url);
  return contentCache.get(url)!;
}

async function loadArticleContent(url: string): Promise<ArticleBlock[]> {
  const jinaHeaders = {
    'Accept': 'text/markdown',
    'X-Remove-Selector': 'header, nav, footer, aside, .header, .nav, .footer, .sidebar, .menu, [role="navigation"], [role="banner"]',
  };

  // Chạy SONG SONG Jina + HTML media fallback để media xuất hiện cùng lúc với
  // text tóm tắt, không đợi xong Jina mới fetch HTML.
  const mediaHtmlPromise = fetchMediaFromHtml(url).catch(() => [] as ArticleBlock[]);

  // Jina qua proxy local — failover qua các candidate base (cùng origin → IP
  // Metro → loopback). Base chết (IP cũ sau khi đổi Wi-Fi) bị skip sau lần đầu.
  let raw = '';
  for (const base of orderedProxyBases()) {
    try {
      const res = await fetch(`${base}/api/jina?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) { markProxyDead(base); continue; }
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
  const blocks = parseArticleBlocks(raw);
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

  if (blocksToText(blocks).length < LIMITS.articleMinLength && !blocks.some((b) => b.type === 'image' || b.type === 'video')) {
    throw new Error('Bài báo quá ngắn hoặc không có nội dung');
  }
  return blocks;
}

import { LIMITS } from './storage';