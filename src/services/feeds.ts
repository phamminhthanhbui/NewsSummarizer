// News feeds — RSS ưu tiên proxy local (server nhanh hơn nhiều so với
// điện thoại tự nối từng báo); proxy tắt thì gọi thẳng nguồn RSS.
// ponytail: regex XML parser, no libs.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FeedItem } from '../types';
import { KEYS, LIMITS } from '../services/storage';
import { proxiedFetchText } from '../utils/proxy';
import { runCpuTask } from '../utils/parseQueue';

// Màu thương hiệu của từng tờ báo — badge nguồn trên card dùng màu này
export const SOURCE_COLORS: Record<string, string> = {
  'VNExpress': '#9F2247',
  'Tuổi Trẻ': '#ED1C24',
  'Thanh Niên': '#0072BC',
  'VietNamNet': '#D31E26',
  'Dân Trí': '#0066B3',
  'Người Lao Động': '#C4161C',
  'Tiền Phong': '#E31E24',
  'Sài Gòn Giải Phóng': '#D42020',
  'CAND': '#1A4B8C',
  'An ninh Thủ đô': '#8B0000',
  'Sức khỏe & Đời sống': '#009639',
  'Báo Chính phủ': '#C8102E',
  'Báo Giao Thông': '#F7941D',
  'GenK': '#00A651',
  'Cafebiz': '#F0642A',
  'BongDaPlus': '#E30613',
  'HelloBacSi': '#00A99D',
  'Soha': '#F26522',
  'Znews': '#E4182A',
  'Kiến Thức': '#0072BC',
  'Ngoisao': '#D81939',
  'Saostar': '#E0105E',
  'Kenh14': '#FB512A',
  'Nhân Dân': '#B0281E',
  'VTV': '#0091DA',
  'VietnamPlus': '#B3202A',
  'Công Luận': '#E91E63',
  'Giáo dục Thời đại': '#0E7C4D',
};

// name = tên tờ báo (publisher) — "Chọn nguồn tin" lọc theo tờ báo, không theo kênh con.
// Một tờ báo có thể có nhiều feed (mỗi feed 1 category); item mang cả source lẫn category.
// CHỈ báo Việt Nam (đã bỏ BBC/NYT/Al Jazeera). Mọi URL RSS dưới đây đã verify trả item thật.
export const FEEDS = [
  // Việt Nam (tin tổng hợp)
  { name: 'VNExpress', url: 'https://vnexpress.net/rss/tin-moi-nhat.rss', category: 'Việt Nam' },
  { name: 'Tuổi Trẻ', url: 'https://tuoitre.vn/rss/tin-moi-nhat.rss', category: 'Việt Nam' },
  { name: 'Thanh Niên', url: 'https://thanhnien.vn/rss/home.rss', category: 'Việt Nam' },
  { name: 'VietNamNet', url: 'https://vietnamnet.vn/rss/thoi-su.rss', category: 'Việt Nam' },
  { name: 'Dân Trí', url: 'https://dantri.com.vn/rss/home.rss', category: 'Việt Nam' },
  { name: 'Người Lao Động', url: 'https://nld.com.vn/rss/home.rss', category: 'Việt Nam' },
  { name: 'Tiền Phong', url: 'https://tienphong.vn/rss/home.rss', category: 'Việt Nam' },
  { name: 'Sài Gòn Giải Phóng', url: 'https://sggp.org.vn/rss/home.rss', category: 'Việt Nam' },
  { name: 'CAND', url: 'https://cand.com.vn/rss/home.rss', category: 'Việt Nam' },
  { name: 'An ninh Thủ đô', url: 'https://anninhthudo.vn/rss/home.rss', category: 'Việt Nam' },
  { name: 'Báo Chính phủ', url: 'https://baochinhphu.vn/rss', category: 'Việt Nam' },
  { name: 'Báo Giao Thông', url: 'https://baogiaothong.vn/rss/home.rss', category: 'Việt Nam' },

  // Công nghệ
  { name: 'VNExpress', url: 'https://vnexpress.net/rss/so-hoa.rss', category: 'Công nghệ' },
  { name: 'Tuổi Trẻ', url: 'https://tuoitre.vn/rss/cong-nghe.rss', category: 'Công nghệ' },
  { name: 'VietNamNet', url: 'https://vietnamnet.vn/rss/cong-nghe.rss', category: 'Công nghệ' },
  { name: 'GenK', url: 'https://genk.vn/rss/home.rss', category: 'Công nghệ' },

  // Kinh doanh
  { name: 'VNExpress', url: 'https://vnexpress.net/rss/kinh-doanh.rss', category: 'Kinh doanh' },
  { name: 'Tuổi Trẻ', url: 'https://tuoitre.vn/rss/kinh-doanh.rss', category: 'Kinh doanh' },
  { name: 'VietNamNet', url: 'https://vietnamnet.vn/rss/kinh-doanh.rss', category: 'Kinh doanh' },
  { name: 'Cafebiz', url: 'https://cafebiz.vn/rss/home.rss', category: 'Kinh doanh' },
  { name: 'Dân Trí', url: 'https://dantri.com.vn/rss/kinh-doanh.rss', category: 'Kinh doanh' },
  { name: 'Người Lao Động', url: 'https://nld.com.vn/rss/kinh-te.rss', category: 'Kinh doanh' },
  { name: 'Tiền Phong', url: 'https://tienphong.vn/rss/kinh-te.rss', category: 'Kinh doanh' },

  // Thể thao
  { name: 'VNExpress', url: 'https://vnexpress.net/rss/the-thao.rss', category: 'Thể thao' },
  { name: 'Tuổi Trẻ', url: 'https://tuoitre.vn/rss/the-thao.rss', category: 'Thể thao' },
  { name: 'BongDaPlus', url: 'https://bongdaplus.vn/rss/24h.rss', category: 'Thể thao' },
  { name: 'Dân Trí', url: 'https://dantri.com.vn/rss/the-thao.rss', category: 'Thể thao' },
  { name: 'Người Lao Động', url: 'https://nld.com.vn/rss/the-thao.rss', category: 'Thể thao' },
  { name: 'Tiền Phong', url: 'https://tienphong.vn/rss/the-thao.rss', category: 'Thể thao' },
  { name: 'Báo Giao Thông', url: 'https://baogiaothong.vn/rss/the-thao.rss', category: 'Thể thao' },

  // Giải trí
  { name: 'VNExpress', url: 'https://vnexpress.net/rss/giai-tri.rss', category: 'Giải trí' },
  { name: 'Tuổi Trẻ', url: 'https://tuoitre.vn/rss/giai-tri.rss', category: 'Giải trí' },
  { name: 'Kenh14', url: 'https://kenh14.vn/rss/home.rss', category: 'Giải trí' },
  { name: 'Dân Trí', url: 'https://dantri.com.vn/rss/giai-tri.rss', category: 'Giải trí' },
  { name: 'Người Lao Động', url: 'https://nld.com.vn/rss/giai-tri.rss', category: 'Giải trí' },
  { name: 'Tiền Phong', url: 'https://tienphong.vn/rss/giai-tri.rss', category: 'Giải trí' },

  // Sức khỏe
  { name: 'VNExpress', url: 'https://vnexpress.net/rss/suc-khoe.rss', category: 'Sức khỏe' },
  { name: 'Tuổi Trẻ', url: 'https://tuoitre.vn/rss/suc-khoe.rss', category: 'Sức khỏe' },
  { name: 'Dân Trí', url: 'https://dantri.com.vn/rss/suc-khoe.rss', category: 'Sức khỏe' },
  { name: 'Sức khỏe & Đời sống', url: 'https://suckhoedoisong.vn/rss/home.rss', category: 'Sức khỏe' },

  // Bổ sung tổng hợp (verify RSS sống)
  { name: 'Nhân Dân', url: 'https://nhandan.vn/rss/home.rss', category: 'Việt Nam' },
  { name: 'VTV', url: 'https://vtv.vn/rss/home.rss', category: 'Việt Nam' },
  { name: 'VietnamPlus', url: 'https://www.vietnamplus.vn/rss/home.rss', category: 'Việt Nam' },
  { name: 'Công Luận', url: 'https://congluan.vn/rss/home.rss', category: 'Việt Nam' },
  { name: 'Giáo dục Thời đại', url: 'https://giaoducthoidai.vn/rss/home.rss', category: 'Việt Nam' },

  // Video — nuôi dải VIDEO ở Trang chủ, KHÔNG hiện trong stream chính.
  // Link của feed này trỏ về vnexpress.net/<slug>.html, giống hệt bài thường, nên
  // isVideoPageUrl KHÔNG nhận ra chúng; tín hiệu duy nhất là category của feed.
  // ĐỪNG đổi sang vnexpress.net/rss/video.rss: feed đó là kho chết (42/60 item
  // từ 2015, chỉ 1 item của 2026) — dải sẽ toàn video chục năm trước.
  { name: 'VNExpress', url: 'https://video.vnexpress.net/rss/tin-moi-nhat.rss', category: 'Video' },
];

// Feed "tin nổi bật" riêng — KHÔNG nằm trong FEEDS (không hiện trong list thường,
// dành riêng cho carousel trang chủ). Đã dò hết các báo: chỉ 4 báo này có RSS
// nổi bật thật (dantri/tuoitre/vietnamnet/kenh14/thanhnien/nld/sggp... đều 404).
const FEATURED_FEEDS = [
  { name: 'VNExpress', url: 'https://vnexpress.net/rss/tin-noi-bat.rss', category: 'Việt Nam' },
  { name: 'Tiền Phong', url: 'https://tienphong.vn/rss/noi-bat.rss', category: 'Việt Nam' },
  { name: 'An ninh Thủ đô', url: 'https://anninhthudo.vn/rss/noi-bat.rss', category: 'Việt Nam' },
  { name: 'CAND', url: 'https://cand.com.vn/rss/noi-bat.rss', category: 'Việt Nam' },
];

function stripHtml(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#?\w+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractImage(block: string): string | undefined {
  const decode = (url: string) => url.replace(/&amp;/g, '&');
  const enc = block.match(/<enclosure[^>]+url="([^"]+)"/i);
  if (enc) return decode(enc[1]);
  // Chỉ tìm ảnh trong <description> — CDATA đầu tiên của item là <title> (không ảnh)
  // nếu title wrap CDATA (Thanh Niên...) thì lấy nhầm. data-src cho site lazy-load.
  const desc = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
  const haystack = desc ? desc[1] : block;
  const img = haystack.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i);
  if (img) return decode(img[1]);
  // Media RSS: BBC <media:thumbnail url>, NYT <media:content ... url> — ảnh nằm ngoài description.
  const media = block.match(/<media:(?:thumbnail|content)[^>]+url="([^"]+)"/i);
  return media ? decode(media[1]) : undefined;
}

// Parse 1 block <item> → FeedItem (tách khỏi parseXml để chạy theo đợt nhỏ)
function parseItemBlock(block: string): FeedItem | null {
  const title = stripHtml((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const link = ((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '')
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1').trim();
  const pubDate = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] || '';
  const descRaw = (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || '';
  const description = stripHtml(descRaw).slice(0, LIMITS.descriptionMax);
  const image = extractImage(block);
  return title && link ? { title, link, description, pubDate, image, source: '' } : null;
}

// Parse XML theo ĐỢT NHỎ qua hàng đợi CPU. Một feed ~20-80 item — parse cả feed
// trong 1 job (regex full-scan từng item) tạo ra job 50-300ms chặn nguyên khối
// → tap lúc cold-start không phản hồi dù queue đã yield giữa các job. Tách block
// <item> trước (1 scan rẻ, vài ms), rồi parse từng đợt 12 item: mỗi đợt ~1-2 frame.
const PARSE_BATCH = 12;

async function parseXmlChunked(xml: string): Promise<FeedItem[]> {
  const items: FeedItem[] = [];
  const itemRe = /<item>[\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  let batch: string[] = [];
  const flush = async () => {
    if (!batch.length) return;
    const work = batch;
    batch = [];
    const out = await runCpuTask(() => {
      const r: FeedItem[] = [];
      for (const b of work) { const it = parseItemBlock(b); if (it) r.push(it); }
      return r;
    });
    items.push(...out);
  };
  while ((m = itemRe.exec(xml)) !== null) {
    batch.push(m[0]);
    if (batch.length >= PARSE_BATCH) await flush();
  }
  await flush();
  return items;
}

export async function fetchFeed(url: string): Promise<FeedItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    if (Platform.OS === 'web') {
      // Web: RSS nguồn không có CORS header → bắt buộc qua proxy local.
      // proxiedFetchText failover qua các base (cùng origin → IP Metro → loopback),
      // nhớ base sống để lần sau khỏi thử lại. Không proxy nào tới được → [] (cache cũ vẫn hiện).
      const xml = await proxiedFetchText(url, 8000);
      return xml ? await parseXmlChunked(xml) : [];
    }
    // Native: gọi thẳng nguồn RSS (không CORS)
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const xml = await res.text();
    // Parse qua hàng đợi CPU theo đợt nhỏ — các response về theo đợt không đè JS thread
    // (tap phản hồi ngay cả khi 44 feed đang về cùng lúc).
    return parseXmlChunked(xml);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Cache RSS vào AsyncStorage — lần mở app sau hiện tin tức thì (stale-while-revalidate),
// fetch mạng chạy nền rồi cập nhật. Giới hạn 300 item để JSON không phình.
const FEED_CACHE_MAX = 300;
// Reload/reopen trong vòng này thì KHÔNG fetch lại 18 feed — hiện cache ngay.
// Tin mới chỉ cần vài phút; tránh mỗi lần reload bắn 18 request RSS cạnh tranh
// với video crawl + prefetch (nguyên nhân reload lâu).
const FEED_CACHE_SKIP_RELOAD_MS = 30 * 1000;

export async function readFeedsCache(): Promise<FeedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.feedsCache);
    // JSON.parse ~300 item qua hàng đợi CPU — lúc launch không chặn frame đầu
    return raw ? await runCpuTask(() => JSON.parse(raw) as FeedItem[]) : [];
  } catch {
    return [];
  }
}

async function readFeedsCacheTime(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.feedsCacheTime);
    return raw ? +raw || 0 : 0;
  } catch { return 0; }
}

// Cache vừa ghi gần đây (< 1 phút) → reload nên BỎ QUA fetch mạng.
export async function isFeedsCacheFresh(): Promise<boolean> {
  return Date.now() - (await readFeedsCacheTime()) < FEED_CACHE_SKIP_RELOAD_MS;
}

function writeFeedsCache(items: FeedItem[]) {
  // JSON.stringify ~300 item (200-500KB) qua hàng đợi CPU — chạy đồng bộ sẽ
  // chặn đúng frame lúc "load xong" khi user vừa bấm chờ từ nãy
  void runCpuTask(() => {
    AsyncStorage.setItem(KEYS.feedsCache, JSON.stringify(items.slice(0, FEED_CACHE_MAX))).catch(() => {});
    AsyncStorage.setItem(KEYS.feedsCacheTime, String(Date.now())).catch(() => {});
  });
}

// Sắp xếp theo ngày mới nhất & gộp bài trùng link. Dùng cho cả kết quả cuối
// lẫn snapshot từng phần (onProgress) để màn hình hiện bài ngay khi feed đầu tiên xong.
function finalize(results: FeedItem[], featured: FeedItem[]): FeedItem[] {
  // Parse pubDate 1 LẦN mỗi item trước khi sort — trước đây new Date() nằm trong
  // comparator (O(n log n) lần parse lại từ đầu) chạy 20+ lần khi emit partial.
  const all = results
    .map((i) => ({ i, d: new Date(i.pubDate).getTime() }))
    .sort((a, b) => {
      if (isNaN(a.d) && isNaN(b.d)) return 0;
      if (isNaN(a.d)) return 1;
      if (isNaN(b.d)) return -1;
      return b.d - a.d;
    })
    .map((x) => x.i);

  // Deduplicate by link (keep first occurrence = latest). Bài thường trùng link với
  // bài trong feed nổi bật → gắn cờ featured vào bản giữ lại để carousel nhận ra.
  const seen = new Map<string, FeedItem>();
  for (const item of all) {
    if (!seen.has(item.link)) seen.set(item.link, item);
  }
  for (const item of featured) {
    const prev = seen.get(item.link);
    if (prev) prev.featured = true;
    else seen.set(item.link, item);
  }
  return [...seen.values()];
}

// Fetch feed theo pool có giới hạn (tránh bắn ~50 request cùng lúc khiến JS thread
// nghẽn: tap không phản hồi lúc mới mở app). Feed nổi bật chạy TRƯỚC để carousel
// hiện sớm. onProgress được gộp (throttle) để màn hình không re-render liên tục.
const FEED_POOL_SIZE = 8;
// 700ms (từ 350ms) — mỗi emit làm HomeScreen re-render toàn bộ list + sort lại
// toàn bộ accumulator; cold-start storm tranh JS thread với tap. Thưa hơn nữa.
const PROGRESS_MIN_MS = 700;

async function runPool<T>(tasks: (() => Promise<T>)[], size: number, deadlineMs = 0): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  const workers = Array.from({ length: Math.min(size, tasks.length) }, worker);
  if (deadlineMs > 0) {
    await Promise.race([
      Promise.all(workers),
      new Promise((r) => { deadlineTimer = setTimeout(r, deadlineMs); }),
    ]);
  } else {
    await Promise.all(workers);
  }
  if (deadlineTimer) clearTimeout(deadlineTimer);
  return results;
}

export async function fetchAllFeeds(onProgress?: (items: FeedItem[]) => void): Promise<FeedItem[]> {
  // Nổi bật ưu tiên trước trong pool → hero/top stories lên sớm nhất.
  const featuredJobs = FEATURED_FEEDS.map((d) => async () => {
    const items = await fetchFeed(d.url);
    return items.map((i) => ({ ...i, source: d.name, category: d.category, featured: true }));
  });
  const regularJobs = FEEDS.map((d) => async () => {
    const items = await fetchFeed(d.url);
    return items.map((i) => ({ ...i, source: d.name, category: d.category }));
  });

  const accRegular: FeedItem[] = [];
  const accFeatured: FeedItem[] = [];
  let lastEmit = 0;
  let emitTimer: ReturnType<typeof setTimeout> | null = null;

  const emit = () => {
    lastEmit = Date.now();
    emitTimer = null;
    onProgress?.(finalize(accRegular, accFeatured));
  };
  const scheduleEmit = () => {
    const now = Date.now();
    if (now - lastEmit >= PROGRESS_MIN_MS) {
      emit();
    } else if (!emitTimer) {
      emitTimer = setTimeout(emit, PROGRESS_MIN_MS - (now - lastEmit));
    }
  };

  // Chạy pool: mỗi job xong → cập nhật accumulator + hẹn emit gộp, không chờ hết.
  const runJob = async (job: () => Promise<FeedItem[]>, featured: boolean) => {
    const items = await job().catch(() => [] as FeedItem[]);
    if (featured) accFeatured.push(...items);
    else accRegular.push(...items);
    scheduleEmit();
  };
  const jobs = [
    ...featuredJobs.map((j) => () => runJob(j, true)),
    ...regularJobs.map((j) => () => runJob(j, false)),
  ];
  // Deadline 12s: 8s quá ngắn cho 44 feed qua proxy (VietnamNet hay timeout →
  // cache thiếu tin mới). 12s đủ cho 2 vòng pool×probe.
  await runPool(jobs, FEED_POOL_SIZE, 12000);
  if (emitTimer) clearTimeout(emitTimer);

  const final = finalize(accRegular, accFeatured);
  if (final.length) writeFeedsCache(final); // Keep offline cache when every RSS source fails.
  return final;
}

