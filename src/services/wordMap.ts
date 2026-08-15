// Word map cho karaoke-style highlighting (pure, testable).
// offsets[i] = char offset của từ thứ i (flat) trong `summary`;
// paras[pi] = các từ của đoạn pi (text + flat index). Ngắt đoạn khi khoảng trắng chứa \n.
export function buildWordMap(summary: string): {
  offsets: number[];
  paras: { text: string; flat: number }[][];
} {
  const offsets: number[] = [];
  const paras: { text: string; flat: number }[][] = [];
  let cur: { text: string; flat: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(summary)) !== null) {
    offsets.push(m.index);
    cur.push({ text: m[0], flat: offsets.length - 1 });
    const gap = summary.slice(m.index + m[0].length);
    const next = gap.search(/\S/);
    if (next === -1 || gap.slice(0, next).includes('\n')) {
      paras.push(cur);
      cur = [];
    }
  }
  return { offsets, paras };
}
