// Multi-LLM provider support (OpenAI-compatible endpoints + Anthropic + Google)
// ponytail: unified interface, minimal branching

import { Platform } from 'react-native';
import { KEYS } from './storage';
import { orderedProxyBases, markProxyDead, markProxyAlive } from '../utils/proxy';

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
      // List verify sống (probe 2026-09-06): 5 model cũ đã 410 Gone/404 hết.
      { id: 'nvidia/nemotron-3-super-120b-a12b', label: 'Nemotron 3 Super 120B (mạnh, miễn phí)' },
      { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', label: 'Nemotron 3.5 Lightning 30B (nhanh, miễn phí)' },
      { id: 'google/gemma-4-31b-it', label: 'Gemma 4 31B' },
      { id: 'openai/gpt-oss-20b', label: 'gpt-oss-20b (nhanh)' },
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

export interface LlmRequestOptions {
  // Bật response_format json_object trên provider OpenAI-compatible hỗ trợ
  // (OpenAI/OpenRouter). Provider khác dựa vào prompt cứng + robust parser.
  jsonMode?: boolean;
}

// Dựng request theo từng provider (endpoint + kiểu auth khác nhau)
export function buildLlmRequest(
  provider: LLMProvider,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  maxTokens: number,
  customBaseUrl?: string,
  options?: LlmRequestOptions,
): { url: string; headers: Record<string, string>; body: any } {
  const cfg = getProviderConfig(provider);
  if (!cfg) throw new Error('Dịch vụ AI tạm thời không khả dụng, thử lại sau');

  const baseUrl = provider === 'custom' ? (customBaseUrl || '') : cfg.baseUrl;
  if (!baseUrl) throw new Error('Dịch vụ AI tạm thời không khả dụng, thử lại sau');

  // Build request based on provider type
  const isAnthropic = provider === 'anthropic';
  const isGoogle = provider === 'google';
  const jsonField = options?.jsonMode ? { response_format: { type: 'json_object' as const } } : {};

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
      ...jsonField,
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
      ...jsonField,
    };
  }
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
