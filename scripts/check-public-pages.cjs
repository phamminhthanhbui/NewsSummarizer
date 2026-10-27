// Verify the API service keeps the landing page separate from Expo's /index.html.
const base = process.argv[2] || 'http://localhost:3091';
(async () => {
  for (const path of ['/', '/health', '/privacy.html', '/terms.html', '/support.html', '/delete-account.html']) {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    const body = await response.text();
    if (path === '/' && !body.includes('Thông tin sản phẩm')) throw new Error('Wrong landing page');
    console.log(`PASS ${path} HTTP ${response.status}`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
