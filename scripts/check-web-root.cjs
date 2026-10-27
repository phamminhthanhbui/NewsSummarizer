// Regression check: the Expo Web entry HTML must provide the React root.
const url = process.argv[2] || 'http://localhost:8088';
(async () => {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const html = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  if (!/id=["']root["']/.test(html)) {
    throw new Error(`Expo root missing at ${url}. Check public/index.html for a conflicting static page.`);
  }
  console.log(`PASS: ${url} serves Expo Web HTML with id="root".`);
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
