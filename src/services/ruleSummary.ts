// Deterministic sentence selection. No model, credentials or network requests.
export const RULE_SUMMARY_VERSION = 'rules-v1';

export interface RuleSummary {
  intro: string;
  points: string[];
  conclusion: string;
  conclusionLabel: 'Kết quả' | 'Tiếp theo' | '';
  selectedSentences: string[];
  sourceSentenceCount: number;
}

const STOP_WORDS = new Set('và của là có cho với các một những được trong từ tại theo để về khi đã sẽ đang này đó thì cũng vào ra đến như năm ngày tháng người'.split(' '));
const ABBREVIATIONS = /^(?:TS|PGS|GS|ThS|BS|TP|TX|TT|Q|P|H|Mr|Mrs|Ms|Dr|Prof|St|vs|v|tr)$/i;
const DEPENDENT = /^(?:Điều (?:này|đó)|Việc (?:này|đó)|Đây|Họ|Nó|Theo đó|Do đó|Vì vậy|Tuy nhiên|Song|Ngược lại|Ngoài ra|Trong khi đó|Mức này|Số tiền này|Dự án này|(?:Ông|Bà|Anh|Chị) (?:cho biết|nói|khẳng định|nhấn mạnh))(?=\s|[,;:]|$)/iu;
const QUALIFIER = /(?:chưa|không|dự kiến|có thể|ước tính|tạm thời|nếu|tuy nhiên)/iu;
const PLAN = /(?:dự kiến|theo kế hoạch|sẽ (?:triển khai|tiếp tục|hoàn thành|công bố|khởi công|đưa|tổ chức|bắt đầu|xem xét|bàn giao)|tiếp tục (?:điều tra|xác minh|triển khai))/iu;
const RESULT = /(?:kết quả|đã (?:hoàn thành|khắc phục|bàn giao|thu hồi|bắt giữ)|được (?:thông qua|phê duyệt)|chính thức (?:có hiệu lực|đi vào hoạt động))/iu;

const normalizeSpace = (s: string) => s.replace(/\s+/gu, ' ').trim();
const tokens = (s: string) => s.normalize('NFC').toLocaleLowerCase('vi').match(/[\p{L}\p{N}]+/gu)?.filter(w => w.length > 1 && !STOP_WORDS.has(w)) || [];

/** Protect decimal numbers, initials and common Vietnamese title abbreviations. */
export function splitNewsSentences(text: string): string[] {
  const s = normalizeSpace(text);
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (!/[.!?…]/u.test(s[i])) continue;
    if (s[i] === '.' && /\d/u.test(s[i - 1] || '') && /\d/u.test(s[i + 1] || '')) continue;
    if (s[i] === '.') {
      const word = s.slice(start, i).match(/([\p{L}.]+)$/u)?.[1] || '';
      if (ABBREVIATIONS.test(word) || /^(?:[A-Z]\.)*[A-Z]$/u.test(word)) continue;
    }
    let end = i + 1;
    while (end < s.length && /[.!?…\u201d\u2019"')\]]/u.test(s[end])) end++;
    if (end < s.length && !/\s/u.test(s[end])) continue;
    const part = s.slice(start, end).trim();
    if (part) out.push(part);
    start = end;
    i = end - 1;
  }
  const tail = s.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function paragraphs(text: string, title: string): string[] {
  const titleKey = normalizeSpace(title).toLocaleLowerCase('vi').replace(/[.!?]+$/u, '');
  return text.replace(/\r\n?/g, '\n')
    .replace(/!\[[^\]]*\]\([^\n)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^\n)]*\)/g, '$1')
    .split(/\n+/u)
    .map(p => normalizeSpace(p.replace(/^\s*(?:#{1,6}\s+|[-•*]\s+)/u, '')))
    .filter(p => {
      if (!p || p.length < 18 || p.toLocaleLowerCase('vi').replace(/[.!?]+$/u, '') === titleKey) return false;
      if (/^(?:Title|URL Source|Markdown Content|Published Time|Source|Tác giả|Ảnh|Hình|Photo|Video|Nguồn ảnh|Chú thích ảnh)\s*:/iu.test(p)) return false;
      if (/^(?:Quảng cáo|Advertisement|Đăng ký(?: nhận tin)?|Đăng nhập|Bình luận|Chia sẻ bài viết|Đọc thêm|Xem thêm|Tin liên quan|Có thể bạn quan tâm|Bạn đọc quan tâm|Copy tóm tắt|AI TÓM TẮT)(?:\s*[:.!?]|$)/iu.test(p)) return false;
      if (/^(?:https?:\/\/\S+|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:\s+\d{1,2}:\d{2})?(?:\s*\(GMT[^)]*\))?)$/u.test(p)) return false;
      return true;
    });
}

type Sentence = { text: string; index: number; paragraph: number; words: Set<string>; score: number };
function overlap(a: Set<string>, b: Set<string>): number {
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / Math.max(1, a.size + b.size - common);
}

function duplicate(a: Sentence, b: Sentence): boolean {
  if (normalizeSpace(a.text).toLocaleLowerCase('vi') === normalizeSpace(b.text).toLocaleLowerCase('vi')) return true;
  // Changed amounts and qualifications must survive even with similar wording.
  const numbers = (s: string) => (s.match(/\d+(?:[.,/]\d+)*/g) || []).join('|');
  const qualifiers = (s: string) => (s.toLocaleLowerCase('vi').match(/chưa|không|dự kiến|có thể|ước tính|tạm thời|nếu/gu) || []).sort().join('|');
  return numbers(a.text) === numbers(b.text) && qualifiers(a.text) === qualifiers(b.text) && overlap(a.words, b.words) > 0.9;
}

export function selectRuleSummary(text: string, title = ''): RuleSummary {
  const empty: RuleSummary = { intro: '', points: [], conclusion: '', conclusionLabel: '', selectedSentences: [], sourceSentenceCount: 0 };
  const candidates: Sentence[] = [];
  paragraphs(text, title).forEach((p, paragraph) => {
    const parts = splitNewsSentences(p);
    parts.forEach((part, i) => {
      // A clipped RSS tail must not become a made-up complete sentence.
      if (/(?:…|\.{3})["”')\]]*$/u.test(part) && i === parts.length - 1) return;
      if (part.length < 18 || part.split(/\s+/u).length < 4) return;
      const candidate = { text: part, paragraph, index: candidates.length, words: new Set(tokens(part)), score: 0 };
      if (!candidates.some(previous => duplicate(candidate, previous))) candidates.push(candidate);
    });
  });
  if (!candidates.length) return empty;
  const titleWords = new Set(tokens(title));
  const frequency = new Map<string, number>();
  for (const s of candidates) for (const w of s.words) frequency.set(w, (frequency.get(w) || 0) + 1);
  for (const s of candidates) {
    let titleHits = 0, recurring = 0;
    for (const w of s.words) {
      if (titleWords.has(w)) titleHits++;
      recurring += Math.min(3, frequency.get(w) || 0);
    }
    s.score = 3 * titleHits / Math.max(1, Math.sqrt(titleWords.size))
      + recurring / Math.max(1, s.words.size)
      + 2.5 / (1 + s.index * 0.16)
      + (/\d/u.test(s.text) ? 0.8 : 0)
      + (QUALIFIER.test(s.text) ? 2.5 : 0)
      - (DEPENDENT.test(s.text) ? 0.5 : 0);
  }

  // Lead supplies the subject. Its dependent next sentence stays with it.
  const lead = candidates.find(s => !DEPENDENT.test(s.text)) || candidates[0];
  const leadGroup = [lead];
  const next = candidates[lead.index + 1];
  if (next && next.paragraph === lead.paragraph && DEPENDENT.test(next.text)) leadGroup.push(next);
  const used = new Set(leadGroup.map(s => s.index));
  const groupText = (group: Sentence[]) => group.map(s => s.text).join(' ');

  const contextGroup = (s: Sentence): Sentence[] => {
    const group = [s];
    let previous = s.index - 1;
    while (DEPENDENT.test(group[0].text) && previous >= 0 && !used.has(previous) && group.length < 3) {
      group.unshift(candidates[previous--]);
    }
    if (DEPENDENT.test(group[0].text) && !used.has(previous)) return [];
    return group;
  };

  // Only an explicit closing result or plan earns a conclusion.
  let ending: Sentence[] = [], conclusionLabel: RuleSummary['conclusionLabel'] = '';
  if (candidates.length >= 5) {
    const closing = candidates.slice(Math.max(lead.index + 1, candidates.length - 2))
      .filter(s => !used.has(s.index) && (PLAN.test(s.text) || (RESULT.test(s.text) && !/(?:nếu|có thể|chưa|dự kiến)/iu.test(s.text)))).pop();
    if (closing) {
      ending = contextGroup(closing);
      const after = candidates[closing.index + 1];
      if (ending.length && after && DEPENDENT.test(after.text)) ending.push(after);
      if (ending.length) conclusionLabel = PLAN.test(closing.text) ? 'Tiếp theo' : 'Kết quả';
    }
  }
  const endingStart = ending[0]?.index ?? candidates.length;
  const pointGroups: Sentence[][] = [];
  const pointLimit = Math.min(5, Math.max(3, Math.ceil(candidates.length * 0.15)));
  let characters = groupText(leadGroup).length + groupText(ending).length;
  while (pointGroups.length < pointLimit) {
    const options = candidates.filter(s => s.index > leadGroup[leadGroup.length - 1].index && s.index < endingStart && !used.has(s.index));
    const ranked = options.map(s => ({
      s,
      merit: s.score - Math.max(0, ...[...used].map(i => overlap(s.words, candidates[i].words))) * 3,
    })).sort((a, b) => b.merit - a.merit || a.s.index - b.s.index);
    let chosen: Sentence[] = [];
    for (const { s } of ranked) {
      const group = contextGroup(s).filter(g => !used.has(g.index));
      if (!group.length || group.some(g => g.index >= endingStart)) continue;
      if (characters + groupText(group).length > 1700 && pointGroups.length > 0) continue;
      chosen = group;
      break;
    }
    if (!chosen.length) break;
    for (const s of chosen) used.add(s.index);
    characters += groupText(chosen).length;
    pointGroups.push(chosen);
  }
  pointGroups.sort((a, b) => a[0].index - b[0].index);
  // Merge overlapping context groups and keep every chosen sentence in source order.
  const pointSentences = [...new Set(pointGroups.flat())].sort((a, b) => a.index - b.index);
  const points: string[] = [];
  let group: Sentence[] = [];
  for (const s of pointSentences) {
    if (group.length && !DEPENDENT.test(s.text)) { points.push(groupText(group)); group = []; }
    group.push(s);
  }
  if (group.length) points.push(groupText(group));
  const selected = [...leadGroup, ...pointSentences, ...ending].sort((a, b) => a.index - b.index);
  return {
    intro: groupText(leadGroup), points, conclusion: groupText(ending), conclusionLabel,
    selectedSentences: selected.map(s => s.text), sourceSentenceCount: candidates.length,
  };
}

export function formatRuleSummary(s: RuleSummary): string {
  return [s.intro, ...s.points.map(p => `• ${p}`), s.conclusion ? `${s.conclusionLabel}: ${s.conclusion}` : ''].filter(Boolean).join('\n\n');
}

export function buildRuleSummary(text: string, title = ''): string {
  return formatRuleSummary(selectRuleSummary(text, title));
}

export function fingerprintSummaryInput(text: string): string {
  let hash = 2166136261;
  const source = normalizeSpace(text);
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

export function isCurrentRuleSummary(record: { summary: string; method?: string; summaryVersion?: string }): boolean {
  return record.method === 'rules' && record.summaryVersion === RULE_SUMMARY_VERSION && !!record.summary.trim();
}
