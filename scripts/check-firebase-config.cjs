// Read-only Firebase Auth project configuration check. Never print the API key.
const fs = require('node:fs');
const path = require('node:path');
const envFile = path.resolve(__dirname, '..', '.env');
const file = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
const env = Object.fromEntries(file.split(/\r?\n/).filter(line => /^[A-Z][A-Z0-9_]*=/.test(line)).map(line => {
  const pos = line.indexOf('=');
  return [line.slice(0, pos), line.slice(pos + 1)];
}));
const key = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || env.EXPO_PUBLIC_FIREBASE_API_KEY;
const project = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
if (!key || !project) {
  console.error('Missing Firebase apiKey or projectId in .env');
  process.exit(1);
}
(async () => {
  const url = new URL('https://identitytoolkit.googleapis.com/v1/projects');
  url.searchParams.set('key', key);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await response.json();
  if (!response.ok) {
    console.error('Firebase authentication project check failed:', response.status, json?.error?.message || 'Unknown response');
    process.exitCode = 1;
    return;
  }
  // The Identity Toolkit endpoint sometimes returns the NUMERIC Firebase project ID.
  const actual = String(json.projectId || json.projectNumber || '');
  const sender = process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const matching = actual === project || actual === sender;
  console.log('Firebase Auth API connected successfully.');
  console.log('Project identifier returned:', actual || '(not returned)');
  console.log('Matches configured Firebase project:', matching);
  console.log('Email/password enabled:', json.signIn?.email?.enabled ?? '(not reported by API)');
  if (actual && !matching) process.exitCode = 1;
})().catch(error => {
  console.error('Connection check failed:', error.message);
  process.exitCode = 1;
});
