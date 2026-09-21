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

    const ct = response.headers.get('content-type') || '';
    // Stream (SSE): bơm thẳng từng chunk về client — chữ chạy dần thay vì chờ
    // model sinh xong hết (giảm cảm giác chờ 2-5s xuống ~0.5s tới token đầu).
    if (response.ok && body && body.stream && ct.includes('event-stream')) {
      res.status(response.status);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Accel-Buffering', 'no');
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
      } catch (e) { /* client đóng sớm */ }
      return res.end();
    }

    const data = await response.text();

    // Forward response headers
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    // Log lỗi upstream (400/403/429...) kèm model + message để chẩn đoán
    // "POST /api/llm 400" trong console client không nói lên model nào bị từ chối.
    if (!response.ok) {
      let upstreamModel = '';
      try { upstreamModel = JSON.parse(req.body.body)?.model || ''; } catch { /* body không phải JSON */ }
      console.warn(`/api/llm upstream ${response.status} model=${upstreamModel}: ${data.slice(0, 300)}`);
    }

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
const FETCH_CACHE_TTL = 60 * 1000;
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

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36' }; // Chrome UA — Saostar (và một số CDN) chặn UA lạ trả trang vỏ

// Proxy media (HLS + mp4): CDN chặn browser phát trực tiếp (segment trả 407/406
// theo Referer) nên server fetch hộ với Referer đúng theo nguồn. Playlist .m3u8
// được rewrite mọi URL tuyệt đối về lại /api/hls?url=... để hls.js chỉ nói
// chuyện với proxy. File mp4 đi qua thẳng, hỗ trợ Range để seek.
const MEDIA_REFERERS = {
  'thanhnien.mediacdn.vn': 'https://thanhnien.vn/',
  'cdn2.tuoitre.vn': 'https://tuoitre.vn/',
  'vcdn.dantri.com.vn': 'https://dantri.com.vn/',
  'streaming.znews.vn': 'https://znews.vn/',
  'cdn.kienthuc.net.vn': 'https://kienthuc.net.vn/',
  'd1.vnecdn.net': 'https://ngoisao.vnexpress.net/',
  'ss-hls.saostar.vn': 'https://saostar.vn/',
};

app.get('/api/hls', async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string' || !/^https:\/\/([^/]*\.)?(thanhnien\.mediacdn\.vn|cdn2\.tuoitre\.vn|vcdn\.dantri\.com\.vn|streaming\.znews\.vn|cdn\.kienthuc\.net\.vn|d1\.vnecdn\.net|kenh14cdn\.com|ss-images\.saostar\.vn|ss-hls\.saostar\.vn)\//.test(url)) {
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
// kèm retry khi Jina chập chờn (503). MỖI attempt có timeout 20s (trước đây
// fetch treo vô hạn khi r.jina.ai chậm → cả chuỗi tóm tắt chết theo).
// In-flight dedup: prefetch + open article cùng call 1 URL → gộp 1 upstream.
// Cache RAM 3 phút: web reload không phải chờ Jina 9-12s lại từ đầu.
const JINA_REMOVE_SELECTOR = 'header, nav, footer, aside, .header, .nav, .footer, .sidebar, .menu, [role="navigation"], [role="banner"]';
const JINA_CACHE_TTL = 3 * 60 * 1000;
const jinaInflight = new Map(); // url -> Promise<{status, body}>
const jinaCache = new Map();    // url -> { t, body }

function jinaFetchOnce(url) {
  return fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, {
    headers: { 'Accept': 'text/markdown', 'X-Remove-Selector': JINA_REMOVE_SELECTOR },
    signal: AbortSignal.timeout(20000),
  }).then(async (r) => ({ status: r.status, body: await r.text() }));
}

app.get('/api/jina', async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing required query param: url' });
  }

  const hit = jinaCache.get(url);
  if (hit && Date.now() - hit.t < JINA_CACHE_TTL) {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    return res.send(hit.body);
  }

  let lastStatus = 502;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let p = jinaInflight.get(url);
      if (!p) {
        p = jinaFetchOnce(url).finally(() => jinaInflight.delete(url));
        jinaInflight.set(url, p);
      }
      const { status, body } = await p;
      if (status >= 200 && status < 300) {
        if (jinaCache.size > 100) jinaCache.clear();
        jinaCache.set(url, { t: Date.now(), body });
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        return res.send(body);
      }
      lastStatus = status;
      // 4xx (trừ 408/429) là lỗi request, retry vô ích
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        return res.status(status).json({ error: `Jina error ${status}` });
      }
    } catch (e) {
      console.error('Jina proxy error:', e.message);
    }
    if (attempt < 1) await new Promise((r) => setTimeout(r, 800));
  }
  res.status(502).json({ error: 'Jina failed after retries', status: lastStatus });
});

// Bóc stream video (m3u8 HOẶC mp4) từ HTML thô của trang bài viết. Trang dạng
// VIDEO (video.vnexpress.net/...) nhúng player JS nên Jina markdown KHÔNG chứa
// link stream — phải đọc HTML gốc. Trả {stream:''} khi không có.
// ponytail: JS-player-only pages (Kiến Thức) không có link trong HTML — cần
// crawler riêng, ngoài scope fix này.
function extractStream(html) {
  // Dân Trí: JSON streamLocalPath (relative /vod/...) → ghép CDN
  const dt = html.match(/streamLocalPath"\s*:\s*"([^"]+)"/);
  if (dt) return 'https://vcdn.dantri.com.vn' + dt[1];
  const m = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i)
    || html.match(/https?:\/\/(?![^"'\s]*\.gif\.)[^"']+\.mp4[^"'\s\\]*/i);
  return m ? m[0].replace(/&amp;/g, '&') : '';
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
    res.json({ stream: extractStream(await response.text()) });
  } catch (e) {
    res.status(502).json({ error: 'article-stream failed', message: e.message });
  }
});

const PORT = process.env.PROXY_PORT || 3001;
app.listen(PORT, () => {
  console.log(`CORS Proxy running on http://localhost:${PORT}`);
});
