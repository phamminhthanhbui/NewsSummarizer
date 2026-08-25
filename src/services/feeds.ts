// News feeds — RSS ưu tiên proxy local (server nhanh hơn nhiều so với
// điện thoại tự nối từng báo); proxy tắt thì gọi thẳng nguồn RSS.
// ponytail: regex XML parser, no libs.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FeedItem } from '../types';
import { KEYS, LIMITS } from '../services/storage';
import { getProxyBase } from '../utils/proxy';

// RSS đi qua proxy local (server/proxy.js, port 3001) — tự nhận IP LAN trên
// điện thoại, localhost trên web local; override bằng EXPO_PUBLIC_PROXY_URL.
const PROXY = getProxyBase() + '/api/fetch?url=';

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
  'Kenh14': '#FB512A',
  'HelloBacSi': '#00A99D',
  'Soha': '#F26522',
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
  { name: 'HelloBacSi', url: 'https://hellobacsi.com/rss.xml', category: 'Sức khỏe' },
  { name: 'Dân Trí', url: 'https://dantri.com.vn/rss/suc-khoe.rss', category: 'Sức khỏe' },
  { name: 'Sức khỏe & Đời sống', url: 'https://suckhoedoisong.vn/rss/home.rss', category: 'Sức khỏe' },
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

function parseXml(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRe = /<item>[\s\S]*?<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[0];
    const title = stripHtml((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const link = ((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '')
      .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1').trim();
    const pubDate = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] || '';
    const descRaw = (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || '';
    const description = stripHtml(descRaw).slice(0, LIMITS.descriptionMax);
    const image = extractImage(block);
    if (title && link) items.push({ title, link, description, pubDate, image, source: '' });
  }
  return items;
}

export async function fetchFeed(url: string): Promise<FeedItem[]> {
  // Thử qua proxy trước; proxy tắt/không tới được → thử gọi thẳng nguồn RSS.
  // Native không bị CORS nên gọi thẳng đọc được ngay khi PC tắt proxy;
  // web khi đó vẫn dính CORS và trả [] (vốn dĩ web cần proxy cùng máy).
  const attempts = [PROXY + encodeURIComponent(url), url];
  for (const finalUrl of attempts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(finalUrl, { signal: controller.signal });
      if (!res.ok) continue;
      const xml = await res.text();
      return parseXml(xml);
    } catch {
      // proxy hỏng / CORS / timeout → thử nguồn tiếp theo
    } finally {
      clearTimeout(timer);
    }
  }
  return [];
}

// Cache RSS vào AsyncStorage — lần mở app sau hiện tin tức thì (stale-while-revalidate),
// fetch mạng chạy nền rồi cập nhật. Giới hạn 300 item để JSON không phình.
const FEED_CACHE_MAX = 300;

export async function readFeedsCache(): Promise<FeedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.feedsCache);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeFeedsCache(items: FeedItem[]) {
  AsyncStorage.setItem(KEYS.feedsCache, JSON.stringify(items.slice(0, FEED_CACHE_MAX))).catch(() => {});
}

// Sắp xếp theo ngày mới nhất & gộp bài trùng link. Dùng cho cả kết quả cuối
// lẫn snapshot từng phần (onProgress) để màn hình hiện bài ngay khi feed đầu tiên xong.
function finalize(results: FeedItem[], featured: FeedItem[]): FeedItem[] {
  const all = results.slice().sort((a, b) => {
    const da = new Date(a.pubDate).getTime();
    const db = new Date(b.pubDate).getTime();
    if (isNaN(da) && isNaN(db)) return 0;
    if (isNaN(da)) return 1;
    if (isNaN(db)) return -1;
    return db - da;
  });

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

export async function fetchAllFeeds(onProgress?: (items: FeedItem[]) => void): Promise<FeedItem[]> {
  const regularTasks = FEEDS.map(async (d) => {
    const items = await fetchFeed(d.url);
    return items.map((i) => ({ ...i, source: d.name, category: d.category }));
  });
  const featuredTasks = FEATURED_FEEDS.map(async (d) => {
    const items = await fetchFeed(d.url);
    return items.map((i) => ({ ...i, source: d.name, category: d.category, featured: true }));
  });
  const allTasks = [...regularTasks, ...featuredTasks];

  // Snapshot từng phần: feed nào xong trước thì bài của nó lên màn hình trước,
  // không phải chờ feed chậm nhất (timeout 15s).
  const accRegular: FeedItem[] = [];
  const accFeatured: FeedItem[] = [];
  regularTasks.forEach((t) => t.then((items) => {
    accRegular.push(...items);
    onProgress?.(finalize(accRegular, accFeatured));
  }).catch(() => {}));
  featuredTasks.forEach((t) => t.then((items) => {
    accFeatured.push(...items);
    onProgress?.(finalize(accRegular, accFeatured));
  }).catch(() => {}));

  const settled = await Promise.allSettled(allTasks);
  const results = settled.slice(0, FEEDS.length).flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const featuredResults = settled.slice(FEEDS.length).flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

  writeFeedsCache(finalize(results, featuredResults));
  return finalize(results, featuredResults);
}

