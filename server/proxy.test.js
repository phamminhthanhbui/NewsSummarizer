// Live check: start proxy, then node server/proxy.test.js http://localhost:3001
const assert = require('node:assert/strict');
const { X509Certificate } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { rootCertificates } = require('node:tls');
const path = require('node:path');

async function main() {
  const ca = new X509Certificate(readFileSync(path.join(__dirname, 'tls-extra-ca.pem')));
  assert(ca.ca, 'Bundled certificate must be a CA');
  assert(Date.now() < Date.parse(ca.validTo), 'Bundled CA has expired');
  assert(rootCertificates.some((pem) => {
    const root = new X509Certificate(pem);
    return ca.checkIssued(root) && ca.verify(root.publicKey);
  }), 'Intermediate must be signed by a trusted Node root');

  const base = process.argv[2] || 'http://localhost:3001';
  for (const url of [
    'https://anninhthudo.vn/rss/noi-bat.rss',
    'https://anninhthudo.vn/rss/home.rss',
    'https://vnexpress.net/rss/tin-moi-nhat.rss',
  ]) {
    const response = await fetch(`${base}/api/fetch?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200, url);
    assert.match(await response.text(), /<rss[\s>]/i, url);
    console.log(`OK ${url}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
