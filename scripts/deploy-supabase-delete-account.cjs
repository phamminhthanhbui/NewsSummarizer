const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const env = { ...process.env };
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const i = text.indexOf('=');
    if (i < 0) continue;
    const key = text.slice(0, i).trim();
    if (!(key in env)) env[key] = text.slice(i + 1).trim();
  }
}

const url = env.EXPO_PUBLIC_SUPABASE_URL || '';
let projectRef = '';
try { projectRef = new URL(url).hostname.split('.')[0]; } catch {}
if (!projectRef) {
  console.error('Missing/invalid EXPO_PUBLIC_SUPABASE_URL.');
  process.exit(1);
}

console.log(`Deploying delete-account to Supabase project ${projectRef}...`);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npx, ['supabase', 'functions', 'deploy', 'delete-account', '--project-ref', projectRef], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
