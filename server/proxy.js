const express = require('express');
const cors = require('cors');

// Node 24 bug (undici): keep-alive socket bị đóng giữa chừng → assert(!this.paused)
// ném uncaughtException ở tầng socket parser, ngoài tầm try/catch của từng route
// → giết cả proxy. Nuốt ĐÚNG lỗi này thôi; mọi uncaught khác vẫn crash như thường.
process.on('uncaughtException', (err) => {
  if (err && err.code === 'ERR_ASSERTION' && /undici/.test(err.stack || '')) return;
  throw err;
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.post('/api/llm', async (req, res) => {
  const { url, headers, body, method } = req.body;

  if (!url || !headers || !body) {
    return res.status(400).json({ error: 'Missing required fields: url, headers, body' });
  }

  try {
    const response = await fetch(url, {
      method: method || 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.text();

    // Forward response headers
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    res.status(response.status).send(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Proxy request failed', message: error.message });
  }
});

// Generic fetch proxy — RSS feeds etc. Fetch phía server nên không dính CORS
// của trình duyệt, thay proxy Vercel (api-proxy-liart-ten) hay 502.
// Cache in-memory TTL 3 phút: app mở lại/reload trong vòng 3 phút = 45 feed trả
// tức thì từ RAM, khỏi fetch lại từng báo. TTL ngắn nên tin vẫn đủ mới.
const FETCH_CACHE_TTL = 3 * 60 * 1000;
const fetchCache = new Map(); // url -> { t, ct, body }

app.get('/api/fetch', async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing required query param: url' });
  }
  const hit = fetchCache.get(url);
  if (hit && Date.now() - hit.t < FETCH_CACHE_TTL) {
    res.setHeader('Content-Type', hit.ct);
    return res.send(hit.body);
  }
  try {
    // Upstream timeout 8s: RSS host treo/crawl chậm không được giữ request client
    // lâu — client đã tự fallback sang gọi thẳng nếu proxy không kịp trả.
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsSummarizer RSS reader)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream ${response.status}` });
    }
    const data = await response.text();
    // Cap 200 entry — quá cũ thì tự rơi ra khi Map phình, không cần sweeper
    if (fetchCache.size > 200) fetchCache.clear();
    fetchCache.set(url, { t: Date.now(), ct: response.headers.get('content-type') || 'text/xml; charset=utf-8', body: data });
    res.setHeader('Content-Type', response.headers.get('content-type') || 'text/xml; charset=utf-8');
    return res.send(data);
  } catch (e) {
    res.status(502).json({ error: 'Fetch failed', message: e.message });
  }
});

// Crawl danh sách video từ trang video của các báo — RSS không có video/live.
// Kenh14: <li class="swiper-slide"> mang data-title, data-share, data-thumb, duration.
//   KHÔNG dùng data-htmlcode: mọi item trỏ về cùng video đầu tiên (bug phía site).
// Soha: <article class="box-category-item"> — href relative, thumb ở poster/img,
//   ngày giờ trong comment time-ago.
const decodeHtml = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; NewsSummarizer RSS reader)' };

async function crawlKenh14() {
  const response = await fetch('https://video.kenh14.vn/', { headers: UA });
  if (!response.ok) return [];
  const html = await response.text();
  const videos = [];
  const seen = new Set();
  for (const block of html.split('<li class="swiper-slide"').slice(1)) {
    const attr = (name) => {
      const m = block.match(new RegExp(name + '="([^"]*)"'));
      return m ? decodeHtml(m[1]) : '';
    };
    const title = attr('data-title');
    const link = attr('data-share');
    if (!title || !link || seen.has(link)) continue;
    seen.add(link);
    // data-vid là đường dẫn mp4 tương đối (kenh14cdn.com/...) — dùng làm stream
    const vid = attr('data-vid');
    videos.push({
      title,
      link,
      // data-thumb là bản to (zoom 980x551); background-image chỉ là thumb 80px
      thumb: attr('data-thumb') || (block.match(/background-image:\s*url\('([^']+)'\)/) || [])[1] || '',
      duration: (block.match(/ava_duration">([^<]+)</) || [])[1] || '',
      pubDate: attr('data-distribution-date'),
      zone: attr('data-zone-name'),
      source: 'Kenh14',
      stream: vid ? (vid.startsWith('http') ? vid : 'https://' + vid) : '',
    });
  }
  return videos;
}

// Soha: bài không kèm data-vid trong listing → fetch trang chi tiết để lấy mp4.
// Giới hạn song song 10, mỗi request 6s; bài nào fail thì giữ stream rỗng
// (popup fallback mở trang gốc).
async function fetchSohaStream(link) {
  try {
    const r = await fetch(link, { headers: UA, signal: AbortSignal.timeout(6000) });
    const h = await r.text();
    const vid = (h.match(/data-vid="([^"]+)"/) || [])[1] || '';
    if (!vid) return '';
    return vid.startsWith('http') ? vid : 'https://' + vid;
  } catch (e) {
    console.log('[soha] stream fail', link, '→', e?.message || e);
    return '';
  }
}

async function crawlSoha() {
  const response = await fetch('https://soha.vn/video.htm', { headers: UA });
  if (!response.ok) return [];
  const html = await response.text();
  const videos = [];
  const seen = new Set();
  for (const block of html.split('<article class="box-category-item').slice(1)) {
    const title = decodeHtml((block.match(/title="([^"]+)"/) || [])[1] || '');
    const href = (block.match(/href="(\/video\/[^"]+)"/) || [])[1] || '';
    if (!title || !href) continue;
    const link = 'https://soha.vn' + href;
    if (seen.has(link)) continue;
    seen.add(link);
    videos.push({
      title,
      link,
      thumb: (block.match(/poster="([^"]+)"/) || block.match(/<img[^>]+src="([^"]+)"/) || [])[1] || '',
      duration: '',
      pubDate: (block.match(/time-ago" title="([^"]+)"/) || [])[1] || '',
      zone: '',
      source: 'Soha',
      stream: '',
    });
  }
  // Stream có sẵn trong các player div ẩn trên listing: data-share="...video-123.htm"
  // → data-vid. Ghép theo id cuối URL.
  const streamById = new Map();
  for (const block of html.split('<div class="VCSortableInPreviewMode').slice(1)) {
    const id = (block.match(/data-share="[^"]*video-(\d+)\.htm"/) || [])[1] || '';
    const vid = (block.match(/data-vid="([^"]+)"/) || [])[1] || '';
    if (id && vid) streamById.set(id, vid.startsWith('http') ? vid : 'https://' + vid);
  }
  const idOf = (link) => (link.match(/-(\d+)\.htm$/) || [])[1] || '';
  const need = videos.filter((v) => !streamById.has(idOf(v.link))).slice(0, 12);
  for (let i = 0; i < need.length; i += 10) {
    const batch = await Promise.all(need.slice(i, i + 10).map((v) => fetchSohaStream(v.link)));
    need.slice(i, i + 10).forEach((v, j) => { v.stream = batch[j]; });
  }
  for (const v of videos) {
    const id = idOf(v.link);
    if (!v.stream && streamById.has(id)) v.stream = streamById.get(id);
  }
  return videos;
}

// VNExpress video nổi bật: <article class="art_item art_featured pel"> — data-extend
// JSON chứa dr (duration giây), thumb ở data-original (lazy load), title ở attr title.
async function crawlVnExpressVideo() {
  const response = await fetch('https://video.vnexpress.net/', { headers: UA });
  if (!response.ok) return [];
  const html = await response.text();
  const videos = [];
  const seen = new Set();
  for (const block of html.split('<article class="art_item art_featured pel"').slice(1)) {
    const href = (block.match(/href="(https:\/\/video\.vnexpress\.net\/[^"]+\.html)"/) || [])[1] || '';
    const title = decodeHtml((block.match(/title="([^"]+)"/) || [])[1] || '');
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);
    const dr = parseInt((block.match(/"dr":(\d+)/) || [])[1] || '0', 10);
    videos.push({
      title,
      link: href,
      thumb: decodeHtml((block.match(/data-original="([^"]+)"/) || block.match(/data-fornext="([^"]+)"/) || [])[1] || ''),
      duration: dr ? `${Math.floor(dr / 60)}:${String(dr % 60).padStart(2, '0')}` : '',
      pubDate: '',
      zone: 'Video nổi bật',
      source: 'VNExpress',
      // data-extend JSON chứa m3u8 (HLS master) — phát trong popup qua /api/hls
      stream: (block.match(/"m3u8":"([^"]+)"/) || [])[1]?.replace(/\\\//g, '/') || '',
    });
  }
  // Video nào listing không cho sẵn m3u8 (data-extend thiếu) → fetch trang chi tiết
  // của chính nó để bóc stream, tránh rơi vào fallback "xem tại nguồn".
  // Giới hạn 12 video đầu + batch 10 để crawl không kéo dài.
  const need = videos.filter((v) => !v.stream).slice(0, 12);
  for (let i = 0; i < need.length; i += 10) {
    const batch = await Promise.all(need.slice(i, i + 10).map(async (v) => {
      try {
        const r = await fetch(v.link, { headers: UA, signal: AbortSignal.timeout(6000) });
        return extractM3u8(await r.text());
      } catch { return ''; }
    }));
    need.forEach((v, j) => { v.stream = batch[j]; });
  }
  return videos;
}

// Thanh Niên: <a class="box-category-link-with-avatar" href title data-vid> + img src
async function crawlThanhNien() {
  const response = await fetch('https://thanhnien.vn/video.htm', { headers: UA });
  if (!response.ok) return [];
  const html = await response.text();
  const videos = [];
  const seen = new Set();
  for (const block of html.split('<a class="box-category-link-with-avatar').slice(1)) {
    const href = (block.match(/href="(\/[^"]+\.htm)"/) || [])[1] || '';
    const title = decodeHtml((block.match(/title="([^"]*)"/) || [])[1] || '');
    const vid = (block.match(/data-vid="([^"]+)"/) || [])[1] || '';
    const thumb = (block.match(/<img[^>]+src="([^"]+)"/) || [])[1] || '';
    if (!href || !title || !href.startsWith('/') || seen.has(href)) continue;
    seen.add(href);
    videos.push({
      title,
      link: 'https://thanhnien.vn' + href,
      thumb,
      duration: '',
      pubDate: '',
      zone: '',
      source: 'Thanh Niên',
      stream: vid ? (vid.startsWith('http') ? vid : 'https://' + vid) : '',
    });
  }
  return videos;
}

// NLD: <div class="box-category-item" data-id> > <a href title> > <video data-src="...mp4">
async function crawlNld() {
  const response = await fetch('https://nld.com.vn/video.htm', { headers: UA });
  if (!response.ok) return [];
  const html = await response.text();
  const videos = [];
  const seen = new Set();
  for (const block of html.split('<div class="box-category-item"').slice(1)) {
    const href = (block.match(/href="(\/nld\/video[^"]+\.htm)"/) || [])[1] || '';
    // Bỏ link chuyên mục (/nld/video/thoi-su-*.htm) — bài thật luôn có id số cuối URL
    if (!href || !/-\d+\.htm$/.test(href)) continue;
    const title = decodeHtml((block.match(/title="([^"]*)"/) || [])[1] || '');
    const stream = (block.match(/data-src="(https:[^"]+\.mp4)"/) || [])[1] || '';
    const thumb = (block.match(/poster="([^"]+)"/) || [])[1] || '';
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);
    videos.push({
      title,
      link: 'https://nld.com.vn' + href,
      thumb,
      duration: '',
      pubDate: '',
      zone: '',
      source: 'Người Lao Động',
      stream,
    });
  }
  return videos;
}

// Tuổi Trẻ: <article class="box-category-item" data-newsid> > <a href title data-trailer data-thumb>
// data-trailer = "tuoitre/.../video.mp4" → stream = https://cdn2.tuoitre.vn/ + path (bỏ tiền tố tuoitre/)
async function crawlTuoitre() {
  const response = await fetch('https://tuoitre.vn/video/moi-nhat.htm', { headers: UA });
  if (!response.ok) return [];
  const html = await response.text();
  const videos = [];
  const seen = new Set();
  for (const block of html.split('<article class="box-category-item"').slice(1)) {
    const href = (block.match(/href="(\/video\/[^"]+\.htm)"/) || [])[1] || '';
    const title = decodeHtml((block.match(/title="([^"]*)"/) || [])[1] || '');
    const trailer = (block.match(/data-trailer="([^"]+)"/) || [])[1] || '';
    const thumb = (block.match(/data-thumb="([^"]+)"/) || [])[1] || '';
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);
    const rel = trailer.replace(/^tuoitre\//, '');
    videos.push({
      title,
      link: 'https://tuoitre.vn' + href,
      thumb,
      duration: '',
      pubDate: '',
      zone: '',
      source: 'Tuổi Trẻ',
      stream: trailer ? 'https://cdn2.tuoitre.vn/' + rel : '',
    });
  }
  return videos;
}

// Cache crawl video: crawl 6 báo + bóc stream trang chi tiết tốn 10-20s — app mở
// lại trong vài phút thì trả thẳng từ RAM, không crawl lại. TTL 3 phút giữ tin mới.
const VIDEO_CACHE_TTL = 3 * 60 * 1000;

// Video nổi bật: chỉ lấy trong các video MỚI NHẤT (tránh video cũ báo ghim sẵn),
// xoay theo seed — mỗi lần refresh cache ra bộ featured khác nhau.
const FEATURED_COUNT = 6;
const NEWEST_WINDOW = 12;

// Trích ngày đăng từ URL thumb/stream/link (mỗi báo nhúng ngày trong CDN path)
// hoặc pubDate ISO. Ép về post-midnight UTC để so sánh recency.
function videoDate(v) {
  const pool = [v && v.thumb, v && v.stream, v && v.link].filter(Boolean).join(' ');
  const m = pool.match(/(20\d{2})([/-])(\d{1,2})\2(\d{1,2})/);
  if (m) return Date.UTC(+m[1], +m[3] - 1, +m[4]);
  const iso = String((v && v.pubDate) || '').match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
  return 0;
}

function pickNewestFeatured(videos) {
  const sorted = videos
    .map((v) => ({ v, d: videoDate(v) }))
    .sort((a, b) => b.d - a.d || String(a.v.source).localeCompare(String(b.v.source)))
    .map((x) => x.v);
  const window = Math.min(NEWEST_WINDOW, sorted.length);
  const seed = Math.floor(Math.random() * 0xffffffff);
  const start = window ? seed % window : 0;
  const featSet = new Set();
  const featured = [];
  for (let i = 0; i < Math.min(FEATURED_COUNT, window); i++) {
    const v = sorted[(start + i) % window];
    featSet.add(v);
    featured.push(v);
  }
  for (const v of sorted) v.zone = featSet.has(v) ? 'Video nổi bật' : '';
  return [...featured, ...sorted.filter((v) => !featSet.has(v))];
}

let videoCache = null; // { t, videos }
let videoCrawlPromise = null; // crawl đang chạy (tránh bắn trùng request)

async function crawlAllSources() {
  return Promise.allSettled([
    crawlKenh14(), crawlSoha(), crawlVnExpressVideo(), crawlThanhNien(), crawlNld(), crawlTuoitre(),
  ]).then((results) => results
    .map((r) => (r.status === 'fulfilled' ? r.value : []))
    .flat());
}

// Crawl đầy đủ + cache — chạy nền, KHÔNG chặn response đầu.
async function crawlAndCache() {
  if (videoCrawlPromise) return videoCrawlPromise;
  videoCrawlPromise = crawlAllSources()
    .then((videos) => {
      if (videos.length) videoCache = { t: Date.now(), videos: pickNewestFeatured(videos) };
    })
    .catch(() => {})
    .finally(() => { videoCrawlPromise = null; });
  return videoCrawlPromise;
}

app.get('/api/videos', async (req, res) => {
  // Cache còn hạn → trả ngay.
  if (videoCache && Date.now() - videoCache.t < VIDEO_CACHE_TTL) {
    return res.json({ videos: videoCache.videos, cached: true });
  }
  try {
    // Crawl nền dùng chung (1 lần/đợt) — không bắn trùng khi nhiều client cùng hỏi.
    if (!videoCrawlPromise) {
      videoCrawlPromise = crawlAllSources()
        .then((videos) => { if (videos.length) videoCache = { t: Date.now(), videos: pickNewestFeatured(videos) }; })
        .catch(() => {})
        .finally(() => { videoCrawlPromise = null; });
    }
    // Chờ crawl xong HOẶC tối đa 5s — video xuất hiện trong ~5s thay vì 10-20s.
    await Promise.race([
      videoCrawlPromise,
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    if (videoCache && videoCache.videos.length) return res.json({ videos: videoCache.videos, cached: true });
    return res.json({ videos: [], cached: false });
  } catch (e) {
    res.status(502).json({ error: 'Video crawl failed', message: e.message });
  }
});

// Proxy media (HLS + mp4): CDN chặn browser phát trực tiếp (segment trả 407/406
// theo Referer) nên server fetch hộ với Referer đúng theo nguồn. Playlist .m3u8
// được rewrite mọi URL tuyệt đối về lại /api/hls?url=... để hls.js chỉ nói
// chuyện với proxy. File mp4 đi qua thẳng, hỗ trợ Range để seek.
const MEDIA_REFERERS = {
  'vnecdn.net': 'https://video.vnexpress.net/',
  'kenh14cdn.com': 'https://video.kenh14.vn/',
  'sohanews.sohacdn.com': 'https://soha.vn/',
  'thanhnien.mediacdn.vn': 'https://thanhnien.vn/',
  'nld.mediacdn.vn': 'https://nld.com.vn/',
  'cdn2.tuoitre.vn': 'https://tuoitre.vn/',
};

app.get('/api/hls', async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string' || !/^https:\/\/([^/]*\.)?(vnecdn\.net|kenh14cdn\.com|sohanews\.sohacdn\.com|thanhnien\.mediacdn\.vn|nld\.mediacdn\.vn|cdn2\.tuoitre\.vn)\//.test(url)) {
    return res.status(400).json({ error: 'Missing or disallowed url' });
  }
  try {
    const host = new URL(url).hostname;
    const referer = Object.keys(MEDIA_REFERERS).find((k) => host === k || host.endsWith('.' + k));
    const headers = { ...UA, Referer: referer ? MEDIA_REFERERS[referer] : 'https://video.vnexpress.net/' };
    const range = req.headers.range;
    if (range) headers.Range = range;
    const upstream = await fetch(url, { headers });
    if (!upstream.ok) return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
    const ct = upstream.headers.get('content-type') || '';
    if (url.endsWith('.m3u8') || ct.includes('mpegurl')) {
      const text = await upstream.text();
      const base = url.slice(0, url.lastIndexOf('/') + 1);
      const proxied = (u) => '/api/hls?url=' + encodeURIComponent(u);
      const rewritten = text
        .split('\n')
        .map((line) => {
          const t = line.trim();
          if (!t) return line;
          // #EXT-X-KEY:...URI="https://..." — key cũng phải đi qua proxy (CDN chặn)
          if (t.startsWith('#')) {
            return line.replace(/URI="([^"]+)"/, (_, u) => 'URI="' + proxied(new URL(u, base).href) + '"');
          }
          const abs = /^https?:\/\//.test(t) ? t : new URL(t, base).href;
          return proxied(abs);
        })
        .join('\n');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(rewritten);
    }
    // .ts / .key / .mp4: stream nguyên bản (mp4 hỗ trợ Range → seek được)
    res.status(upstream.status);
    res.setHeader('Content-Type', ct || 'application/octet-stream');
    if (upstream.headers.get('content-range')) res.setHeader('Content-Range', upstream.headers.get('content-range'));
    if (upstream.headers.get('accept-ranges')) res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges'));
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    if (upstream.body) {
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      } catch (e) {
        res.end();
      }
    } else {
      res.send(Buffer.from(await upstream.arrayBuffer()));
    }
  } catch (e) {
    res.status(502).json({ error: 'HLS proxy failed', message: e.message });
  }
});

// Jina Reader proxy — fetch phía server nên không dính CORS của trình duyệt,
// kèm retry khi Jina chập chờn (503).
const JINA_REMOVE_SELECTOR = 'header, nav, footer, aside, .header, .nav, .footer, .sidebar, .menu, [role="navigation"], [role="banner"]';

app.get('/api/jina', async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing required query param: url' });
  }

  let lastStatus = 502;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, {
        headers: { 'Accept': 'text/markdown', 'X-Remove-Selector': JINA_REMOVE_SELECTOR },
      });
      if (response.ok) {
        const data = await response.text();
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        return res.send(data);
      }
      lastStatus = response.status;
      // 4xx (trừ 408/429) là lỗi request, retry vô ích
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        return res.status(response.status).json({ error: `Jina error ${response.status}` });
      }
    } catch (e) {
      console.error('Jina proxy error:', e.message);
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  res.status(502).json({ error: 'Jina failed after retries', status: lastStatus });
});

// Bóc stream video (.m3u8) từ HTML thô của trang bài viết. Trang dạng VIDEO
// (video.vnexpress.net/...) nhúng player JS nên Jina markdown KHÔNG chứa link
// stream — phải đọc HTML gốc. Trả {stream:''} khi không có.
// Rút link m3u8 từ HTML trang VnExpress: ưu tiên JSON data-extend
// ("m3u8":"...\/2025\/...\/master.m3u8", escape /), fallback URL .m3u8 đầu tiên.
function extractM3u8(html) {
  const m = html.match(/"m3u8":"([^"]+)"/);
  if (m) return m[1].replace(/\\u002[fF]|\\\//g, '/');
  const g = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
  return g ? g[0] : '';
}

app.get('/api/article-stream', async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing required query param: url' });
  }
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    res.json({ stream: extractM3u8(await response.text()) });
  } catch (e) {
    res.status(502).json({ error: 'article-stream failed', message: e.message });
  }
});

const PORT = process.env.PROXY_PORT || 3001;
app.listen(PORT, () => {
  console.log(`CORS Proxy running on http://localhost:${PORT}`);
});
