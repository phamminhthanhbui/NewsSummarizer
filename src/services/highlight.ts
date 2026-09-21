// Highlight trọng tâm: sinh token từ FocusModel để tô đậm entity/keyword/số trong summary.
// Pure, không dependency react-native — test được bằng node.

import type { FocusModel } from './focus';

export interface HighlightToken {
  start: number;   // char offset trong summary
  end: number;     // exclusive
  text: string;
  kind: 'entity' | 'number' | 'keyword';
  importance: number; // 0..1
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Kiểm tra xung quanh match có phải ký tự chữ/số không (để không highlight
// chuỗi con nằm giữa từ dài hơn). Hỗ trợ tiếng Việt qua range Unicode.
function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[A-Za-z0-9_\u00C0-\u024F]/.test(ch);
}

export function buildHighlightMap(summary: string, focus: FocusModel | null): HighlightToken[] {
  if (!focus || !summary) return [];
  const tokens: HighlightToken[] = [];

  const addPattern = (pattern: string, kind: HighlightToken['kind'], importance: number) => {
    const p = pattern.trim();
    if (!p || p.length < 2) return;
    const re = new RegExp(escapeRegExp(p), 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(summary)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      // Chỉ highlight khi match không nằm giữa một từ dài hơn
      // (vd entity "SJC" trong "SJC-ABC" — không highlight)
      if (isWordChar(summary[start - 1]) || isWordChar(summary[end])) {
        if (m.index === re.lastIndex) re.lastIndex++;
        continue;
      }
      tokens.push({ start, end, text: m[0], kind, importance });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  };

  // Entities (không phải number) → importance cao nhất
  for (const e of focus.entities || []) {
    if (e.type === 'number') {
      addPattern(e.name, 'number', 0.6);
    } else {
      addPattern(e.name, 'entity', 1.0);
    }
  }

  // Keywords → importance trung bình
  for (const k of focus.keywords || []) {
    addPattern(k, 'keyword', 0.7);
  }

  // Số liệu từ thesis/keyPoints nếu không nằm trong entities: rà nhanh
  const numberValues = new Set<string>();
  for (const kp of focus.keyPoints || []) {
    const nums = kp.point.match(/\d[\d.,%]*/g);
    if (nums) for (const n of nums) numberValues.add(n);
  }
  if (focus.thesis) {
    const nums = focus.thesis.match(/\d[\d.,%]*/g);
    if (nums) for (const n of nums) numberValues.add(n);
  }
  for (const nv of numberValues) {
    // Chỉ highlight nếu chưa có entity nào match số này
    if (tokens.some((t) => t.text === nv)) continue;
    addPattern(nv, 'number', 0.5);
  }

  // Sort: importance desc → start asc, greedy filter overlapping
  tokens.sort((a, b) => b.importance - a.importance || a.start - b.start);
  const deduped: HighlightToken[] = [];
  for (const t of tokens) {
    if (deduped.some((d) => d.start < t.end && t.start < d.end)) continue;
    deduped.push(t);
  }
  deduped.sort((a, b) => a.start - b.start);

  // Giới hạn số token tránh over-highlight
  return deduped.slice(0, 40);
}