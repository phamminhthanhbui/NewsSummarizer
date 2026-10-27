// Only recommend stories with evidence of topical overlap, not just the same publisher.
type ArticleForRelated = { title: string; link: string; source: string; category?: string };

const STOP = new Set([
  'va','cua','cac','nhung','mot','trong','voi','theo','cho','duoc','dang','da',
  'nhieu','tai','tu','vao','khi','sau','truoc','len','cung','nay','do','la',
  'co','se','tren','ve','cach','nhat','bao','tin','tuc','moi','hom','qua',
  'cai','cua','de','khong','phai','nhu','thi','roi','den','ngay','nam','nguoi',
]);
const wordsOf = (title: string): string[] => (
  (title.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').match(/[a-z0-9]+/g) || [])
    .filter((word) => word.length >= 2 && !STOP.has(word))
);
const pairsOf = (tokens: string[]) => new Set(tokens.slice(1).map((word, i) => tokens[i] + ' ' + word));

export function relatedArticles<T extends ArticleForRelated>(article: T, all: T[], max = 6): T[] {
  const mine = wordsOf(article.title);
  const uniqueMine = new Set(mine);
  const myPairs = pairsOf(mine);
  const used = new Set<string>([article.link]);
  return all.map((candidate, order) => {
    if (!candidate.link || used.has(candidate.link)) return null;
    const other = wordsOf(candidate.title);
    const shared = [...new Set(other)].filter((w) => uniqueMine.has(w)).length;
    const adjacent = [...pairsOf(other)].filter((p) => myPairs.has(p)).length;
    // Single shared place/person name or a common category alone is not related.
    if (!(shared >= 4 || (shared >= 3 && adjacent >= 1) || (shared >= 2 && adjacent >= 2))) return null;
    return { candidate, order, score: shared * 2 + adjacent * 3 + (candidate.source === article.source ? 1 : 0) };
  }).filter((row): row is { candidate: T; order: number; score: number } => Boolean(row))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .filter((row) => { if (used.has(row.candidate.link)) return false; used.add(row.candidate.link); return true; })
    .slice(0, max).map(({ candidate }) => candidate);
}
