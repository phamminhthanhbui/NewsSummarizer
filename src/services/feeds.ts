// News feeds — RSS via CORS proxy (web) or direct (native)
// ponytail: regex XML parser, no libs. CORS proxy for web only.

import { Platform } from 'react-native';
import type { FeedItem } from '../types';
import { LIMITS } from '../services/storage';

// Web: RSS đi qua proxy local (server/proxy.js, port 3001) — Vercel proxy cũ hay 502 + thiếu CORS
const PROXY = (process.env.EXPO_PUBLIC_PROXY_URL || 'http://localhost:3001') + '/api/fetch?url=';

// name = tên tờ báo (publisher) — "Chọn nguồn tin" lọc theo tờ báo, không theo kênh con.
// Một tờ báo có thể có nhiều feed (mỗi feed 1 category); item mang cả source lẫn category.
export const FEEDS = [
  // Việt Nam
  { name: 'VNExpress', url: 'https://vnexpress.net/rss/tin-moi-nhat.rss', category: 'Việt Nam' },
  { name: 'Tuổi Trẻ', url: 'https://tuoitre.vn/rss/tin-moi-nhat.rss', category: 'Việt Nam' },
  { name: 'Thanh Niên', url: 'https://thanhnien.vn/rss/home.rss', category: 'Việt Nam' },
  { name: 'VietNamNet', url: 'https://vietnamnet.vn/rss/thoi-su.rss', category: 'Việt Nam' },

  // Thế giới
  { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', category: 'Thế giới' },
  { name: 'NYT', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', category: 'Thế giới' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'Thế giới' },

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

  // Thể thao
  { name: 'VNExpress', url: 'https://vnexpress.net/rss/the-thao.rss', category: 'Thể thao' },
  { name: 'Tuổi Trẻ', url: 'https://tuoitre.vn/rss/the-thao.rss', category: 'Thể thao' },
  { name: 'BongDaPlus', url: 'https://bongdaplus.vn/rss/24h.rss', category: 'Thể thao' },

  // Giải trí
  { name: 'VNExpress', url: 'https://vnexpress.net/rss/giai-tri.rss', category: 'Giải trí' },
  { name: 'Tuổi Trẻ', url: 'https://tuoitre.vn/rss/giai-tri.rss', category: 'Giải trí' },
  { name: 'Kenh14', url: 'https://kenh14.vn/rss/home.rss', category: 'Giải trí' },

  // Sức khỏe
  { name: 'VNExpress', url: 'https://vnexpress.net/rss/suc-khoe.rss', category: 'Sức khỏe' },
  { name: 'Tuổi Trẻ', url: 'https://tuoitre.vn/rss/suc-khoe.rss', category: 'Sức khỏe' },
  { name: 'HelloBacSi', url: 'https://hellobacsi.com/rss.xml', category: 'Sức khỏe' },
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
  const img = haystack.match(/<img[^>]+(?:src|data-src)="([^"]+)"/i);
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
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    // Native: no CORS, web: go through proxy
    const finalUrl = Platform.OS === 'web' ? PROXY + encodeURIComponent(url) : url;
    const res = await fetch(finalUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseXml(xml);
  } catch {
    return [];
  }
}

export async function fetchAllFeeds(): Promise<FeedItem[]> {
  const results = await Promise.all(
    FEEDS.map(async (d) => {
      const items = await fetchFeed(d.url);
      return items.map((i) => ({ ...i, source: d.name, category: d.category }));
    }),
  );
  const all = results.flat().sort((a, b) => {
    const da = new Date(a.pubDate).getTime();
    const db = new Date(b.pubDate).getTime();
    if (isNaN(da) && isNaN(db)) return 0;
    if (isNaN(da)) return 1;
    if (isNaN(db)) return -1;
    return db - da;
  });

  // Deduplicate by link (keep first occurrence = latest)
  const seen = new Set<string>();
  return all.filter((item) => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
}

