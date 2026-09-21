// Bóc JSON từ output LLM — LLM thường bọc JSON trong markdown fence, thêm text
// thừa đầu/cuối, trailing comma, key không quote. Trả null nếu không tìm thấy
// object JSON hợp lệ sau khi sửa lỗi thường gặp.

export function safeParseJson(s: string): any | null {
  try { return JSON.parse(s); } catch { return null; }
}

// Sửa lỗi nhỏ hay gặp khi model xuất JSON cẩu thả:
// - trailing comma trước } ]   → bỏ
// - key không quote            → wrap lại
function repairJson(s: string): string {
  return s
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');
}

// Trích object JSON đầu tiên (theo cặp {} cân bằng) ra khỏi chuỗi text bất kỳ.
// Ưu tiên parse trực tiếp; thất bại → repair rồi parse lại.
export function extractJsonObject(raw: string): any | null {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = s.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') inStr = !inStr;
    if (!inStr) {
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const candidate = s.slice(start, i + 1);
          const parsed = safeParseJson(candidate);
          if (parsed) return parsed;
          return safeParseJson(repairJson(candidate));
        }
      }
    }
  }
  // Không tìm được cặp {} cân bằng → thử cả chuỗi đã repair
  return safeParseJson(repairJson(s.slice(start)));
}
