// NVIDIA NIM API — OpenAI-compatible endpoint
// ponytail: public CORS proxy for web; native app doesn't need it
const CORS_PROXY = 'https://corsproxy.io/?';
const NIM_BASE = 'https://integrate.api.nvidia.com/v1';

export const NIM_MODELS = [
  { id: 'meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B (nhanh, miễn phí)' },
  { id: 'mistralai/mistral-7b-instruct-v0.3', label: 'Mistral 7B (nhanh)' },
  { id: 'google/gemma-3-12b-it', label: 'Gemma 3 12B' },
  { id: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (mạnh)' },
  { id: 'mistralai/mistral-large-2-instruct', label: 'Mistral Large 2 (mạnh nhất)' },
];

// Core: summarize article text via NVIDIA NIM
export async function summarizeWithNvidia(
  articleText: string,
  apiKey: string,
  model: string = 'meta/llama-3.1-8b-instruct',
): Promise<string> {
  const prompt = `Tóm tắt bài báo sau bằng tiếng Việt. Giữ các ý chính, số liệu quan trọng. Dùng gạch đầu dòng (-). Tối đa 5 ý. Chỉ trả về các ý tóm tắt, không kèm lời dẫn.`;

  const res = await fetch(`${CORS_PROXY + encodeURIComponent(`${NIM_BASE}/chat/completions`)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: articleText },
      ],
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as any)?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Lỗi NIM API: ${msg}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// Jina Reader: fetch full article content
export async function fetchArticleContent(url: string): Promise<string> {
  const encoded = encodeURIComponent(url);
  const res = await fetch(`https://r.jina.ai/${encoded}`, {
    headers: {
      'Accept': 'text/markdown',
      // Strip page chrome server-side — VnExpress/etc. headers bleed into result
      'X-Remove-Selector': 'header, nav, footer, aside, .header, .nav, .footer, .sidebar, .menu, [role="navigation"], [role="banner"]',
    },
  });
  if (!res.ok) throw new Error(`Không thể đọc bài báo (HTTP ${res.status})`);
  const text = await res.text()
    // Drop residual JS-only links (location dropdowns, nav menus) that slipped through
    .replace(/\[[^\]]+\]\(javascript:[^)]+\)/g, '')
    // Drop React/Reddit styled-component comment divs (css-/r-prop- hash classes)
    .replace(/<div\b[^>]*class="[^"]*\bcss-[a-z0-9]+\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div\b[^>]*class="[^"]*\br-[a-z]+-[a-z0-9]+\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length < 200) throw new Error('Bài báo quá ngắn hoặc không có nội dung');
  return text;
}