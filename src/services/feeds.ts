// News feeds — RSS via CORS proxy (web) or direct (native)
// ponytail: regex XML parser, no libs. CORS proxy for web only.

import { Platform } from 'react-native';
import type { FeedItem } from '../types';

// Self-hosted Vercel proxy — free, reliable, no rate limit
const PROXY = 'https://api-proxy-liart-ten.vercel.app/api/proxy?url=';

export const FEEDS = [
  { name: 'VNExpress', url: 'https://vnexpress.net/rss/tin-moi-nhat.rss', category: 'Việt Nam' },
  { name: 'Tuổi Trẻ', url: 'https://tuoitre.vn/rss/tin-moi-nhat.rss', category: 'Việt Nam' },
  { name: 'Thanh Niên', url: 'https://thanhnien.vn/rss/home.rss', category: 'Việt Nam' },
  { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', category: 'Thế giới' },
  { name: 'NYT', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', category: 'Thế giới' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'Thế giới' },
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
  const cdata = block.match(/<!\[CDATA\[(.*?)\]\]/s);
  const haystack = cdata ? cdata[1] : block;
  const img = haystack.match(/<img[^>]+src="([^"]+)"/i);
  return img ? decode(img[1]) : undefined;
}

function parseXml(xml: string): Partial<FeedItem>[] {
  const items: Partial<FeedItem>[] = [];
  const itemRe = /<item>[\s\S]*?<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[0];
    const title = stripHtml((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const link = ((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '')
      .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1').trim();
    const pubDate = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] || '';
    const descRaw = (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || '';
    const description = stripHtml(descRaw).slice(0, 200);
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
      return items.map((i) => ({ ...i, source: d.name }));
    }),
  );
  return results.flat().sort((a, b) => {
    const da = new Date(a.pubDate).getTime();
    const db = new Date(b.pubDate).getTime();
    if (isNaN(da) && isNaN(db)) return 0;
    if (isNaN(da)) return 1;
    if (isNaN(db)) return -1;
    return db - da;
  });
}

export function getCategories(): string[] {
  return Array.from(new Set(FEEDS.map((d) => d.category)));
}