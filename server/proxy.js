const express = require('express');
const cors = require('cors');

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

// Edge TTS proxy — forwards to Microsoft Edge TTS
app.post('/api/edge-tts', async (req, res) => {
  const { text, voice } = req.body;

  if (!text || !voice) {
    return res.status(400).json({ error: 'Missing required fields: text, voice' });
  }

  try {
    // Microsoft Edge TTS endpoint (SSML)
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="vi-VN">
      <voice name="${voice}">${text.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')}</voice>
    </speak>`;

    const response = await fetch('https://speech.platform.bing.com/consumer/speak', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-Edge-Client': '1',
        'User-Agent': 'Mozilla/5.0',
      },
      body: ssml,
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: 'Edge TTS upstream error', detail: err });
    }

    const arrayBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('Edge TTS proxy error:', error);
    res.status(500).json({ error: 'Edge TTS proxy failed', message: error.message });
  }
});

const PORT = process.env.PROXY_PORT || 3001;
app.listen(PORT, () => {
  console.log(`CORS Proxy running on http://localhost:${PORT}`);
});