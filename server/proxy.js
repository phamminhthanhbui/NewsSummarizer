const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
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
    videos.push({
      title,
      link,
      // data-thumb là bản to (zoom 980x551); background-image chỉ là thumb 80px
      thumb: attr('data-thumb') || (block.match(/background-image:\s*url\('([^']+)'\)/) || [])[1] || '',
      duration: (block.match(/ava_duration">([^<]+)</) || [])[1] || '',
      pubDate: attr('data-distribution-date'),
      zone: attr('data-zone-name'),
      source: 'Kenh14',
    });
  }
  return videos;
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
    });
  }
  return videos;
}

app.get('/api/videos', async (req, res) => {
  try {
    // Nguồn nào chết thì trả list rỗng, không kéo sập cả endpoint
    const [kenh14, soha] = await Promise.all([
      crawlKenh14().catch(() => []),
      crawlSoha().catch(() => []),
    ]);
    res.json({ videos: [...kenh14, ...soha] });
  } catch (e) {
    res.status(502).json({ error: 'Video crawl failed', message: e.message });
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

// Cache MP3 theo (text+voice): nghe lại bài cũ / đổi giọng rồi nghe lại phải tức thì,
// khỏi tổng hợp lại — upstream cold mất 7-15s, đây là nguyên nhân chờ 15-20s.
const ttsCache = new Map(); // sha256 -> Buffer, FIFO cap 100 (~50MB)

app.post('/api/edge-tts', async (req, res) => {
  const { text, voice } = req.body;
  if (!text || !voice) {
    return res.status(400).json({ error: 'Missing required fields: text, voice' });
  }

  const key = crypto.createHash('sha256').update(voice + '\n' + text).digest('hex');
  const hit = ttsCache.get(key);
  if (hit) {
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.send(hit);
  }

  // Upstream đôi khi "ngủ quên"/rate-limit tức thời → retry với backoff.
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const audio = await synthesize(text, voice);
      if (ttsCache.size >= 100) ttsCache.delete(ttsCache.keys().next().value);
      ttsCache.set(key, audio);
      res.setHeader('Content-Type', 'audio/mpeg');
      return res.send(audio);
    } catch (e) {
      lastErr = e;
      console.error(`Edge TTS attempt ${attempt + 1} failed:`, e.message);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  res.status(502).json({ error: 'Edge TTS failed after retries', message: lastErr?.message });
});

const PORT = process.env.PROXY_PORT || 3001;
app.listen(PORT, () => {
  console.log(`CORS Proxy running on http://localhost:${PORT}`);
});