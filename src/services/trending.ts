// Sắp bài cho strip "ĐỌC NHIỀU NHẤT" ở Home.
//
// Tách khỏi HomeScreen vì hai lý do: (1) HomeScreen kéo theo React Native nên
// không chạy được bằng `node`, (2) đây là chỗ dễ hỏng nhất — bản cũ xáo ngẫu
// nhiên bằng Math.random() nên strip toàn bài cũ mà không ai phát hiện.
//
// KHÔNG import gì (kể cả storage.ts — file đó đã kéo AsyncStorage vào).

export type TrendingItem = { link: string; pubDate?: string };

/**
 * Sắp theo số lượt đọc giảm dần; hoà thì bài mới hơn lên trước.
 *
 * Chưa đọc bài nào → mọi count = 0 → hoà hết → kết quả là "N bài mới nhất",
 * vẫn là thứ tự hợp lý cho máy mới. pubDate hỏng/thiếu tính là 0 (cũ nhất) để
 * không làm NaN lây cả phép so sánh.
 */
export function rankTrending<T extends TrendingItem>(
  items: T[],
  readCounts: Record<string, number> | null | undefined,
  max = 6,
): T[] {
  const counts = readCounts || {};
  const at = (d?: string) => {
    const t = d ? new Date(d).getTime() : NaN;
    return Number.isFinite(t) ? t : 0;
  };
  return [...items]
    .sort(
      (a, b) => (counts[b.link] || 0) - (counts[a.link] || 0) || at(b.pubDate) - at(a.pubDate),
    )
    .slice(0, max);
}
