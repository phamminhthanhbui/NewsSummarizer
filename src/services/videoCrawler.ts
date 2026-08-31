// Video crawl NGAY TRONG APP — không cần proxy PC.
// Cập nhật: thêm detail-page fallback để lấy stream cho video thiếu,
// lấy video nổi bật từ các video MỚI NHẤT (sắp theo ngày), cache TTL để video không cũ.

import type { VideoItem } from '../types';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
const FEATURED_COUNT = 6;      // số video nổi bật xuất hiện ở strip
const NEWEST_WINDOW = 12;      // chỉ chọn featured trong 12 video mới nhất (tránh video cũ)
const MAX_DETAIL_FETCHES = 10;

// Trích ngày đăng từ URL thumb/stream/link (mỗi báo đều nhúng ngày trong CDN path)
// hoặc từ pubDate ISO. Ép về post-midnight UTC để so sánh recency.
function dateOfVideo(v: VideoItem): number {
  const pool = [v.thumb, v.stream, v.link].filter(Boolean).join(' ');
  const m = pool.match(/(20\d{2})([\/-])(\d{1,2})\2(\d{1,2})/);
  if (m) return Date.UTC(+m[1], +m[3] - 1, +m[4]);
  const iso = String(v.pubDate || '').match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
  return 0; // không có ngày — xếp cuối, không rơi vào featured
}

const decodeHtml = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

async function getHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { headers: UA, signal: controller.signal });
    if (!res.ok) return '';
    return res.text();
  } finally { clearTimeout(timer); }
}

async function fetchStreamFromDetail(link: string, source: string): Promise<string> {
  try {
    const html = await getHtml(link);
    if (!html) return '';
    // VNExpress / generic m3u8 in page
    const m3u8 = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
    if (m3u8) return m3u8[0].replace(/&amp;/g, '&');
    // data-vid (Kenh14, Soha, ThanhNien style)
    const vid = html.match(/data-vid="([^"]+)"/) || html.match(/data-trailer="([^"]+)"/);
    if (vid) {
      const v = vid[1].replace(/\\\//g, '/');
      return v.startsWith('http') ? v : (v.startsWith('//') ? 'https:' + v : 'https://' + v);
    }
    // direct mp4 in src/data-src
    const mp4 = html.match(/https?:\/\/[^"']+\.mp4[^"']*/);
    if (mp4) return mp4[0].replace(/&amp;/g, '&');
    // source/file keys in JS
    const src = html.match(/"file"\s*:\s*"([^"]+)"/) || html.match(/"source"\s*:\s*"([^"]+)"/);
    if (src) return src[1].replace(/\\\//g, '/');
    return '';
  } catch { return ''; }
}

/* ─── crawlers ─── */

async function crawlKenh14(): Promise<VideoItem[]> {
  const html = await getHtml('https://video.kenh14.vn/');
  if (!html) return [];
  const videos: VideoItem[] = [];
  const seen = new Set<string>();
  for (const block of html.split('<li class="swiper-slide"').slice(1)) {
    const attr = (name: string) => {
      const m = block.match(new RegExp(name + '="([^"]*)"'));
      return m ? decodeHtml(m[1]) : '';
    };
    const title = attr('data-title');
    const link = attr('data-share');
    if (!title || !link || seen.has(link)) continue;
    seen.add(link);
    const vid = attr('data-vid');
    videos.push({
      title, link,
      thumb: attr('data-thumb') || (block.match(/background-image:\s*url\('([^']+)'\)/) || [])[1] || '',
      duration: (block.match(/ava_duration">([^<]+)</) || [])[1] || '',
      pubDate: attr('data-distribution-date'),
      zone: '',
      source: 'Kenh14',
      stream: vid ? (vid.startsWith('http') ? vid : 'https://' + vid) : '',
    });
  }
  return videos;
}

async function crawlSoha(): Promise<VideoItem[]> {
  const html = await getHtml('https://soha.vn/video.htm');
  if (!html) return [];
  const videos: VideoItem[] = [];
  const seen = new Set<string>();
  for (const block of html.split('<article class="box-category-item').slice(1)) {
    const title = decodeHtml((block.match(/title="([^"]+)"/) || [])[1] || '');
    const href = (block.match(/href="(\/video\/[^"]+)"/) || [])[1] || '';
    if (!title || !href) continue;
    const link = 'https://soha.vn' + href;
    if (seen.has(link)) continue;
    seen.add(link);
    videos.push({
      title, link,
      thumb: (block.match(/poster="([^"]+)"/) || block.match(/<img[^>]+src="([^"]+)"/) || [])[1] || '',
      duration: '', pubDate: (block.match(/time-ago" title="([^"]+)"/) || [])[1] || '',
      zone: '', source: 'Soha', stream: '',
    });
  }
  const streamById = new Map<string, string>();
  for (const block of html.split('<div class="VCSortableInPreviewMode').slice(1)) {
    const id = (block.match(/data-share="[^"]*video-(\d+)\.htm"/) || [])[1] || '';
    const vid = (block.match(/data-vid="([^"]+)"/) || [])[1] || '';
    if (id && vid) streamById.set(id, vid.startsWith('http') ? vid : 'https://' + vid);
  }
  const idOf = (link: string) => (link.match(/-(\d+)\.htm$/) || [])[1] || '';
  for (const v of videos) { const id = idOf(v.link); if (streamById.has(id)) v.stream = streamById.get(id); }
  return videos;
}

// VNExpress: featured + regular article blocks, detail fallback cho thiếu stream
async function crawlVnExpressVideo(): Promise<VideoItem[]> {
  const html = await getHtml('https://video.vnexpress.net/');
  if (!html) return [];
  const videos: VideoItem[] = [];
  const seen = new Set<string>();

  for (const raw of html.split('<article class="art_item').slice(1)) {
    const cls = (raw.match(/^([^"]*)"/) || [])[1] || '';
    if (!cls.startsWith(' ')) continue;
    const href = (raw.match(/href="(https:\/\/video\.vnexpress\.net\/[^"]+\.html)"/) || [])[1] || '';
    const title = decodeHtml((raw.match(/title="([^"]+)"/) || [])[1] || '');
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);
    const dr = parseInt((raw.match(/"dr":(\d+)/) || [])[1] || '0', 10);
    const thumb = decodeHtml((raw.match(/data-original="([^"]+)"/) || raw.match(/data-fornext="([^"]+)"/) || [])[1] || '');
    const featured = cls.includes('art_featured');
    videos.push({
      title, link: href, thumb,
      duration: dr ? `${Math.floor(dr / 60)}:${String(dr % 60).padStart(2, '0')}` : '',
      pubDate: '',
      zone: featured ? 'Video nổi bật' : '',
      source: 'VNExpress',
      stream: (raw.match(/"m3u8":"([^"]+)"/) || [])[1]?.replace(/\\\//g, '/') || '',
    });
  }
  return videos;
}

async function crawlThanhNien(): Promise<VideoItem[]> {
  const html = await getHtml('https://thanhnien.vn/video.htm');
  if (!html) return [];
  const videos: VideoItem[] = [];
  const seen = new Set<string>();
  for (const block of html.split('<a class="box-category-link-with-avatar').slice(1)) {
    const href = (block.match(/href="(\/[^"]+\.htm)"/) || [])[1] || '';
    const title = decodeHtml((block.match(/title="([^"]*)"/) || [])[1] || '');
    const vid = (block.match(/data-vid="([^"]+)"/) || [])[1] || '';
    const thumb = (block.match(/<img[^>]+src="([^"]+)"/) || [])[1] || '';
    if (!href || !title || !href.startsWith('/') || seen.has(href)) continue;
    seen.add(href);
    videos.push({
      title, link: 'https://thanhnien.vn' + href, thumb, duration: '', pubDate: '', zone: '', source: 'Thanh Niên',
      stream: vid ? (vid.startsWith('http') ? vid : 'https://' + vid) : '',
    });
  }
  return videos;
}

async function crawlNld(): Promise<VideoItem[]> {
  const html = await getHtml('https://nld.com.vn/video.htm');
  if (!html) return [];
  const videos: VideoItem[] = [];
  const seen = new Set<string>();
  for (const block of html.split('<div class="box-category-item"').slice(1)) {
    const href = (block.match(/href="(\/[^"]+\.htm)"/) || [])[1] || '';
    if (!href || !/-\d+\.htm$/.test(href)) continue;
    const title = decodeHtml((block.match(/title="([^"]*)"/) || [])[1] || '');
    const stream = (block.match(/data-src="(https:[^"]+\.mp4)"/) || [])[1] || '';
    const thumb = (block.match(/poster="([^"]+)"/) || [])[1] || '';
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);
    videos.push({
      title, link: 'https://nld.com.vn' + href, thumb, duration: '', pubDate: '', zone: '', source: 'Người Lao Động', stream,
    });
  }
  return videos;
}

async function crawlTuoitre(): Promise<VideoItem[]> {
  const html = await getHtml('https://tuoitre.vn/video/moi-nhat.htm');
  if (!html) return [];
  const videos: VideoItem[] = [];
  const seen = new Set<string>();
  for (const block of html.split('<article class="box-category-item"').slice(1)) {
    const href = (block.match(/href="(\/video\/[^"]+\.htm)"/) || [])[1] || '';
    const title = decodeHtml((block.match(/title="([^"]*)"/) || [])[1] || '');
    const trailer = (block.match(/data-trailer="([^"]+)"/) || [])[1] || '';
    const thumb = (block.match(/data-thumb="([^"]+)"/) || [])[1] || '';
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);
    const rel = trailer.replace(/^tuoitre\//, '');
    videos.push({
      title, link: 'https://tuoitre.vn' + href, thumb, duration: '', pubDate: '', zone: '', source: 'Tuổi Trẻ',
      stream: trailer ? 'https://cdn2.tuoitre.vn/' + rel : '',
    });
  }
  return videos;
}

/* ─── pool ─── */

async function runPool<T>(tasks: (() => Promise<T>)[], size: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  const workers = Array.from({ length: Math.min(size, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

/* ─── main ─── */

// Seed xáo ngẫu nhiên MỖI LẦN crawl — mỗi lần mở app/reload ra một bộ
// featured khác nhau, nhưng luôn chọn từ các video MỚI NHẤT (không video cũ).

export async function crawlAllVideos(onPartial?: (v: VideoItem[]) => void): Promise<VideoItem[]> {
  // Crawl TẤT CẢ nguồn song song ngay từ đầu (trước đây await VnExpress trước rồi
  // mới crawl nguồn khác → video delay bằng thời gian crawl nguồn chậm nhất).
  const sources = [
    crawlVnExpressVideo, crawlKenh14, crawlSoha, crawlThanhNien, crawlNld, crawlTuoitre,
  ];
  const results: VideoItem[][] = new Array(sources.length);
  let settledCount = 0;
  let lastPartial = [] as VideoItem[];
  // Seed xáo ngẫu nhiên GIỮ NGUYÊN trong 1 lần crawl — partial→full emit không
  // đổi bộ featured (strip không nhảy). Lần crawl sau mới ra seed khác.
  const seed = Math.floor(Math.random() * 0xffffffff);

  const emitIfBetter = () => {
    const all = results.filter(Boolean).flat();
    if (!all.length) return;
    for (const v of all) v.zone = '';
    const sorted = all
      .map((v) => ({ v, d: dateOfVideo(v) }))
      .sort((a, b) => b.d - a.d || a.v.source.localeCompare(b.v.source))
      .map((x) => x.v);
    const window = Math.min(NEWEST_WINDOW, sorted.length);
    const start = window ? seed % window : 0;
    const featSet = new Set<VideoItem>();
    const featured: VideoItem[] = [];
    for (let i = 0; i < Math.min(FEATURED_COUNT, window); i++) {
      const v = sorted[(start + i) % window];
      featSet.add(v);
      featured.push(v);
    }
    for (const v of sorted) v.zone = featSet.has(v) ? 'Video nổi bật' : '';
    lastPartial = [...featured, ...sorted.filter((v) => !featSet.has(v))];
    onPartial?.(lastPartial);
  };

  await Promise.all(sources.map((fn, i) =>
    fn().catch(() => [] as VideoItem[]).then((v) => {
      results[i] = v;
      settledCount++;
      // Nguồn nào xong là push featured ngay — strip hiện dần từ nguồn đầu
      // (~2-3s) thay vì chờ cả 6 nguồn (~10-20s).
      emitIfBetter();
    }),
  ));
  emitIfBetter();

  // Fill stream cho video thiếu song song (batch giới hạn) — chỉ đợi nếu chưa
  // có gì để hiện; nếu đã có partial thì trả ngay, stream về sau gắn vào object.
  const missing = lastPartial
    .filter((v) => !v.stream)
    .concat([])
    .slice(0, MAX_DETAIL_FETCHES);
  if (missing.length) {
    await runPool(missing.map((v) => () => fetchStreamFromDetail(v.link, v.source).then((s) => { if (s) v.stream = s; })), 5);
  }
  return lastPartial;
}