const express = require('express');
const cors = require('cors');

// Node 24 bug (undici): keep-alive socket bá»‹ Ä‘Ã³ng giá»¯a chá»«ng â†’ assert(!this.paused)
// nÃ©m uncaughtException á»Ÿ táº§ng socket parser, ngoÃ i táº§m try/catch cá»§a tá»«ng route
// â†’ giáº¿t cáº£ proxy. Nuá»‘t ÄÃšNG lá»—i nÃ y thÃ´i; má»i uncaught khÃ¡c váº«n crash nhÆ° thÆ°á»ng.
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

// Generic fetch proxy â€” RSS feeds etc. Fetch phÃ­a server nÃªn khÃ´ng dÃ­nh CORS
// cá»§a trÃ¬nh duyá»‡t, thay proxy Vercel (api-proxy-liart-ten) hay 502.
// Cache in-memory TTL 3 phÃºt: app má»Ÿ láº¡i/reload trong vÃ²ng 3 phÃºt = 45 feed tráº£
// tá»©c thÃ¬ tá»« RAM, khá»i fetch láº¡i tá»«ng bÃ¡o. TTL ngáº¯n nÃªn tin váº«n Ä‘á»§ má»›i.
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
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsSummarizer RSS reader)' },
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream ${response.status}` });
    }
    const data = await response.text();
    // Cap 200 entry â€” quÃ¡ cÅ© thÃ¬ tá»± rÆ¡i ra khi Map phÃ¬nh, khÃ´ng cáº§n sweeper
    if (fetchCache.size > 200) fetchCache.clear();
    fetchCache.set(url, { t: Date.now(), ct: response.headers.get('content-type') || 'text/xml; charset=utf-8', body: data });
    res.setHeader('Content-Type', response.headers.get('content-type') || 'text/xml; charset=utf-8');
    return res.send(data);
  } catch (e) {
    res.status(502).json({ error: 'Fetch failed', message: e.message });
  }
});

// Crawl danh sÃ¡ch video tá»« trang video cá»§a cÃ¡c bÃ¡o â€” RSS khÃ´ng cÃ³ video/live.
// Kenh14: <li class="swiper-slide"> mang data-title, data-share, data-thumb, duration.
//   KHÃ”NG dÃ¹ng data-htmlcode: má»i item trá» vá» cÃ¹ng video Ä‘áº§u tiÃªn (bug phÃ­a site).
// Soha: <article class="box-category-item"> â€” href relative, thumb á»Ÿ poster/img,
//   ngÃ y giá» trong comment time-ago.
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
    // data-vid lÃ  Ä‘Æ°á»ng dáº«n mp4 tÆ°Æ¡ng Ä‘á»‘i (kenh14cdn.com/...) â€” dÃ¹ng lÃ m stream
    const vid = attr('data-vid');
    videos.push({
      title,
      link,
      // data-thumb lÃ  báº£n to (zoom 980x551); background-image chá»‰ lÃ  thumb 80px
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

// Soha: bÃ i khÃ´ng kÃ¨m data-vid trong listing â†’ fetch trang chi tiáº¿t Ä‘á»ƒ láº¥y mp4.
// Giá»›i háº¡n song song 5, má»—i request 8s; bÃ i nÃ o fail thÃ¬ giá»¯ stream rá»—ng
// (popup fallback má»Ÿ trang gá»‘c).
async function fetchSohaStream(link) {
  try {
    const r = await fetch(link, { headers: UA, signal: AbortSignal.timeout(8000) });
    const h = await r.text();
    const vid = (h.match(/data-vid="([^"]+)"/) || [])[1] || '';
    if (!vid) return '';
    return vid.startsWith('http') ? vid : 'https://' + vid;
  } catch (e) {
    console.log('[soha] stream fail', link, 'â†’', e?.message || e);
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
  // Stream cÃ³ sáºµn trong cÃ¡c player div áº©n trÃªn listing: data-share="...video-123.htm"
  // â†’ data-vid. GhÃ©p theo id cuá»‘i URL.
  const streamById = new Map();
  for (const block of html.split('<div class="VCSortableInPreviewMode').slice(1)) {
    const id = (block.match(/data-share="[^"]*video-(\d+)\.htm"/) || [])[1] || '';
    const vid = (block.match(/data-vid="([^"]+)"/) || [])[1] || '';
    if (id && vid) streamById.set(id, vid.startsWith('http') ? vid : 'https://' + vid);
  }
  const idOf = (link) => (link.match(/-(\d+)\.htm$/) || [])[1] || '';
  const need = videos.filter((v) => !streamById.has(idOf(v.link)));
  for (let i = 0; i < need.length; i += 5) {
    const batch = await Promise.all(need.slice(i, i + 5).map((v) => fetchSohaStream(v.link)));
    need.slice(i, i + 5).forEach((v, j) => { v.stream = batch[j]; });
  }
  for (const v of videos) {
    const id = idOf(v.link);
    if (!v.stream && streamById.has(id)) v.stream = streamById.get(id);
  }
  return videos;
}

// VNExpress video ná»•i báº­t: <article class="art_item art_featured pel"> â€” data-extend
// JSON chá»©a dr (duration giÃ¢y), thumb á»Ÿ data-original (lazy load), title á»Ÿ attr title.
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
      zone: 'Video ná»•i báº­t',
      source: 'VNExpress',
      // data-extend JSON chá»©a m3u8 (HLS master) â€” phÃ¡t trong popup qua /api/hls
      stream: (block.match(/"m3u8":"([^"]+)"/) || [])[1]?.replace(/\\\//g, '/') || '',
    });
  }
  // Video nÃ o listing khÃ´ng cho sáºµn m3u8 (data-extend thiáº¿u) â†’ fetch trang chi tiáº¿t
  // cá»§a chÃ­nh nÃ³ Ä‘á»ƒ bÃ³c stream, trÃ¡nh rÆ¡i vÃ o fallback "xem táº¡i nguá»“n".
  const need = videos.filter((v) => !v.stream);
  for (let i = 0; i < need.length; i += 5) {
    const batch = await Promise.all(need.slice(i, i + 5).map(async (v) => {
      try {
        const r = await fetch(v.link, { headers: UA, signal: AbortSignal.timeout(8000) });
        return extractM3u8(await r.text());
      } catch { return ''; }
    }));
    need.forEach((v, j) => { v.stream = batch[j]; });
  }
  return videos;
}

// Thanh NiÃªn: <a class="box-category-link-with-avatar" href title data-vid> + img src
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
      source: 'Thanh NiÃªn',
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
    // Bá» link chuyÃªn má»¥c (/nld/video/thoi-su-*.htm) â€” bÃ i tháº­t luÃ´n cÃ³ id sá»‘ cuá»‘i URL
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
      source: 'NgÆ°á»i Lao Äá»™ng',
      stream,
    });
  }
  return videos;
}

// Tuá»•i Tráº»: <article class="box-category-item" data-newsid> > <a href title data-trailer data-thumb>
// data-trailer = "tuoitre/.../video.mp4" â†’ stream = https://cdn2.tuoitre.vn/ + path (bá» tiá»n tá»‘ tuoitre/)
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
      source: 'Tuá»•i Tráº»',
      stream: trailer ? 'https://cdn2.tuoitre.vn/' + rel : '',
    });
  }
  return videos;
}

app.get('/api/videos', async (req, res) => {
  try {
    // Nguá»“n nÃ o cháº¿t thÃ¬ tráº£ list rá»—ng, khÃ´ng kÃ©o sáº­p cáº£ endpoint
    const [kenh14, soha, vnexpress, thanhnien, nld, tuoitre] = await Promise.all([
      crawlKenh14().catch(() => []),
      crawlSoha().catch(() => []),
      crawlVnExpressVideo().catch(() => []),
      crawlThanhNien().catch(() => []),
      crawlNld().catch(() => []),
      crawlTuoitre().catch(() => []),
    ]);
    res.json({ videos: [...kenh14, ...soha, ...vnexpress, ...thanhnien, ...nld, ...tuoitre] });
  } catch (e) {
    res.status(502).json({ error: 'Video crawl failed', message: e.message });
  }
});

// Proxy media (HLS + mp4): CDN cháº·n browser phÃ¡t trá»±c tiáº¿p (segment tráº£ 407/406
// theo Referer) nÃªn server fetch há»™ vá»›i Referer Ä‘Ãºng theo nguá»“n. Playlist .m3u8
// Ä‘Æ°á»£c rewrite má»i URL tuyá»‡t Ä‘á»‘i vá» láº¡i /api/hls?url=... Ä‘á»ƒ hls.js chá»‰ nÃ³i
// chuyá»‡n vá»›i proxy. File mp4 Ä‘i qua tháº³ng, há»— trá»£ Range Ä‘á»ƒ seek.
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
          // #EXT-X-KEY:...URI="https://..." â€” key cÅ©ng pháº£i Ä‘i qua proxy (CDN cháº·n)
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
    // .ts / .key / .mp4: stream nguyÃªn báº£n (mp4 há»— trá»£ Range â†’ seek Ä‘Æ°á»£c)
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

// Jina Reader proxy â€” fetch phÃ­a server nÃªn khÃ´ng dÃ­nh CORS cá»§a trÃ¬nh duyá»‡t,
// kÃ¨m retry khi Jina cháº­p chá»n (503).
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
      // 4xx (trá»« 408/429) lÃ  lá»—i request, retry vÃ´ Ã­ch
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

// BÃ³c stream video (.m3u8) tá»« HTML thÃ´ cá»§a trang bÃ i viáº¿t. Trang dáº¡ng VIDEO
// (video.vnexpress.net/...) nhÃºng player JS nÃªn Jina markdown KHÃ”NG chá»©a link
// stream â€” pháº£i Ä‘á»c HTML gá»‘c. Tráº£ {stream:''} khi khÃ´ng cÃ³.
// RÃºt link m3u8 tá»« HTML trang VnExpress: Æ°u tiÃªn JSON data-extend
// ("m3u8":"...\/2025\/...\/master.m3u8", escape /), fallback URL .m3u8 Ä‘áº§u tiÃªn.
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
