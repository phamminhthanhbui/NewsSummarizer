const fs = require('fs');
const path = require('path');

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

const config = {
  supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  supportEmail: env.EXPO_PUBLIC_SUPPORT_EMAIL || '',
};
const out = `window.NS_PUBLIC_CONFIG = ${JSON.stringify(config)};\n`;
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'site-config.js'), out);
console.log('Generated public/site-config.js using public client values only.');
