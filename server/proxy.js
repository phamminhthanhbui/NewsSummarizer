const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

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
app.get('/api/fetch', async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing required query param: url' });
  }
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsSummarizer RSS reader)' },
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream ${response.status}` });
    }
    const data = await response.text();
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
// Giới hạn song song 5, mỗi request 8s; bài nào fail thì giữ stream rỗng
// (popup fallback mở trang gốc).
async function fetchSohaStream(link) {
  try {
    const r = await fetch(link, { headers: UA, signal: AbortSignal.timeout(8000) });
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

app.get('/api/videos', async (req, res) => {
  try {
    // Nguồn nào chết thì trả list rỗng, không kéo sập cả endpoint
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

// Edge TTS proxy — Microsoft Edge TTS websocket protocol.
// Endpoint HTTP cũ (/consumer/speak) đã bị khai tử; phải dùng wss readaloud + Sec-MS-GEC token.
const EDGE_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_GEC_VERSION = '1-143.0.3650.75';

// Sec-MS-GEC: SHA-256 của (Windows filetime làm tròn bucket 5 phút + token)
function secMsGec() {
  let ticks = BigInt(Math.floor(Date.now() / 1000)) + 11644473600n; // unix → windows epoch
  ticks -= ticks % 300n;
  ticks *= 10000000n; // giây → 100ns ticks
  return crypto.createHash('sha256').update(ticks.toString() + EDGE_TOKEN).digest('hex').toUpperCase();
}

const escapeXml = (s) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/'/g, '&apos;').replace(/"/g, '&quot;');

// Tổng hợp 1 lần qua websocket; resolve Buffer MP3 hoặc reject.
// timeoutMs là idle timeout: audio được stream ~real-time nên text dài mất
// hàng chục giây; timer reset mỗi lần nhận frame, chỉ fail khi stream đứng.
function synthesize(text, voice, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const connId = crypto.randomBytes(16).toString('hex').toUpperCase();
    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TOKEN}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${EDGE_GEC_VERSION}&ConnectionId=${connId}`;

    const ws = new WebSocket(url, {
      headers: {
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
      },
    });

    const chunks = [];
    let done = false;
    let timer;
    const armTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(new Error('Edge TTS timeout')), timeoutMs);
    };
    const finish = (err, audio) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      err ? reject(err) : resolve(audio);
    };
    armTimer();

    ws.on('open', () => {
      const iso = new Date().toISOString();
      ws.send(`X-Timestamp:${iso}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`);
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'><voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`;
      ws.send(`X-RequestId:${crypto.randomUUID()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${iso}\r\nPath:ssml\r\n\r\n${ssml}`);
    });

    ws.on('message', (data) => {
      armTimer(); // còn frame = còn sống, không tính vào idle timeout
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      // Audio frame: 2-byte BE header length + header (Path:audio) + MP3 payload.
      // Server có thể gửi kèm opcode text, nên detect theo cấu trúc frame thay vì cờ binary.
      if (buf.length > 2) {
        const headerLen = buf.readUInt16BE(0);
        if (headerLen > 0 && headerLen < buf.length) {
          const header = buf.slice(2, 2 + headerLen).toString();
          if (header.includes('Path:audio')) {
            chunks.push(buf.slice(2 + headerLen));
            return;
          }
        }
      }
      if (buf.toString().includes('Path:turn.end')) {
        const audio = Buffer.concat(chunks);
        if (!audio.length) return finish(new Error('Edge TTS returned no audio'));
        finish(null, audio);
      }
    });

    ws.on('error', (e) => finish(e));
    ws.on('unexpected-response', (req, upstream) => finish(new Error(`Edge TTS upstream HTTP ${upstream.statusCode}`)));
  });
}

// Cache MP3 theo (text+voice) trên DISK: nghe lại bài cũ / đổi giọng rồi nghe lại
// phải tức thì, khỏi tổng hợp lại — upstream cold mất 7-30s, đây là nguyên nhân
// chờ 15-20s. In-memory Map mất sạch mỗi lần restart proxy → bug tái phát;
// disk cache sống qua restart.
const TTS_CACHE_DIR = path.join(__dirname, '.tts-cache');
fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

const ttsCacheFile = (key) => path.join(TTS_CACHE_DIR, key + '.mp3');

function ttsCacheGet(key) {
  try { return fs.readFileSync(ttsCacheFile(key)); } catch { return null; }
}

function ttsCacheSet(key, audio) {
  try {
    fs.writeFileSync(ttsCacheFile(key), audio);
    // Cap ~100 file: giữ 100 file mới nhất theo mtime, xóa phần còn lại
    const files = fs.readdirSync(TTS_CACHE_DIR)
      .map((f) => ({ f, m: fs.statSync(path.join(TTS_CACHE_DIR, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    for (const { f } of files.slice(100)) fs.unlinkSync(path.join(TTS_CACHE_DIR, f));
  } catch {}
}

// Tổng hợp 1 chunk với retry 3 lần (upstream chập chờn/rate-limit tức thời)
async function synthesizeChunk(text, voice) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await synthesize(text, voice);
    } catch (e) {
      lastErr = e;
      console.error(`Edge TTS attempt ${attempt + 1} failed:`, e.message);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// Cắt text dài thành câu (mỗi chunk ≤ maxLen ký tự) để tổng hợp song song.
// Cắt ở ranh giới câu để không xé đôi từ, giữ dấu câu + khoảng trắng liền sau.
function splitTtsChunks(text, maxLen = 350) {
  const sentences = text.match(/[^.!?…\n]+[.!?…]*\s*/g) || [text];
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + s).length > maxLen) { chunks.push(cur); cur = s; }
    else cur += s;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// Text dài → cắt câu, tổng hợp SONG SONG các chunk (tối đa 4), ghép MP3 lại.
// Tổng hợp đơn cả bài dài mất 20-40s (upstream stream ~real-time); chia song song
// giảm còn ~10s. MP3 frame độc lập nên ghép phát bình thường.
async function synthesizeText(text, voice) {
  const chunks = splitTtsChunks(text);
  if (chunks.length <= 1) return synthesizeChunk(text, voice);
  const parts = new Array(chunks.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(4, chunks.length) }, async () => {
    while (i < chunks.length) {
      const idx = i++;
      parts[idx] = await synthesizeChunk(chunks[idx], voice);
    }
  });
  await Promise.all(workers);
  return Buffer.concat(parts);
}

// Dedup in-flight: pre-warm (khi summary hiện) và nút Nghe có thể bắn trùng text
// cùng lúc — không dedup thì 2 synthesis chạy song song lên upstream, dễ dính
// rate-limit → retry 3 lần → chờ hàng chục giây. Request sau chờ chung promise
// với request đầu, chỉ tổng hợp 1 lần.
const ttsInflight = new Map(); // key -> Promise<Buffer>

app.post('/api/edge-tts', async (req, res) => {
  const { text, voice } = req.body;
  if (!text || !voice) {
    return res.status(400).json({ error: 'Missing required fields: text, voice' });
  }

  const key = crypto.createHash('sha256').update(voice + '\n' + text).digest('hex');
  const hit = ttsCacheGet(key);
  if (hit) {
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.send(hit);
  }

  let pending = ttsInflight.get(key);
  if (!pending) {
    pending = (async () => {
      const audio = await synthesizeText(text, voice);
      ttsCacheSet(key, audio);
      return audio;
    })().finally(() => ttsInflight.delete(key));
    ttsInflight.set(key, pending);
  }

  try {
    const audio = await pending;
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.send(audio);
  } catch (e) {
    res.status(502).json({ error: 'Edge TTS failed after retries', message: e?.message });
  }
});

const PORT = process.env.PROXY_PORT || 3001;
app.listen(PORT, () => {
  console.log(`CORS Proxy running on http://localhost:${PORT}`);
});