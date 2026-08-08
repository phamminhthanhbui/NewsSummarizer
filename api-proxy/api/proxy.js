export default async function handler(req, res) {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'missing url' });
    // Only allow RSS/XML feeds
    if (!url.match(/^https?:\/\//)) return res.status(400).json({ error: 'invalid url' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsSummarizer/1.0)' },
    });
    clearTimeout(timeout);

    const body = await r.text();

    res
      .status(200)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Content-Type', r.headers.get('content-type') || 'application/xml')
      .send(body);
  } catch (e) {
    res.status(502).json({ error: 'fetch failed' });
  }
}