// ---- TTS chunking: chia tóm tắt thành cụm câu để đọc + bảng neo highlight ----
// Tách khỏi ArticleScreen để test thuần như wordMap.ts.

// Lỗi đồng bộ highlight tích tụ theo độ dài văn bản: đọc cả bài một hơi thì
// lệch 2-3s cuối bài là chuyện thường. Chia cụm ~1-2 câu thì sai số reset sau
// mỗi cụm + hiệu chỉnh ms/ký tự chạy liên tục → bám giọng ở MỌI tốc độ.
export type TtsWord = { text: string; flat: number };

// starts[i] = vị trí ký tự của từ i trong chunk.text; flats[i] = flat index
// tương ứng trong summary — map charIndex của onboundary → đúng từ đang đọc.
export type TtsChunk = { text: string; starts: number[]; flats: number[] };

export function buildTtsChunks(paras: TtsWord[][]): TtsChunk[] {
  const all = paras.flat();
  const chunks: TtsChunk[] = [];
  let ws: TtsWord[] = [];
  const flush = () => {
    if (!ws.length) return;
    const starts: number[] = [];
    let pos = 0;
    for (const w of ws) {
      starts.push(pos);
      pos += w.text.length + 1; // +1 khoảng trắng nối từ
    }
    chunks.push({
      text: ws.map((w) => w.text).join(' '),
      starts,
      flats: ws.map((w) => w.flat),
    });
    ws = [];
  };
  for (let i = 0; i < all.length; i++) {
    const w = all[i];
    if (/^[-–—•*]$/.test(w.text)) continue; // marker gạch đầu dòng — không đọc thành "gạch"
    ws.push(w);
    const endsSentence = /[.!?…]["')]*$/.test(w.text);
    // flat nhảy >1 giữa 2 từ liên tiếp = có \n ở giữa = hết đoạn
    const paraBreak = i + 1 < all.length && all[i + 1].flat - w.flat > 1;
    if (ws.length >= 22 && (endsSentence || paraBreak)) flush();
    else if (ws.length >= 36) flush(); // câu quá dài — cắt cứng cho đều
  }
  flush();
  return chunks;
}

// Từ chứa vị trí ký tự (binary search — starts tăng ngặt). charPos trước từ
// đầu → 0; sau từ cuối → từ cuối. charIndex của boundary thường rơi NGAY ĐẦU
// từ đang đọc nên trả về từ có starts[i] <= charPos.
export function wordIndexAtChar(starts: number[], charPos: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let i = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= charPos) { i = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return i;
}
