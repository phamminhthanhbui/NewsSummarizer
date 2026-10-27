const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const env = { ...process.env };
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index);
    if (!env[key]) env[key] = trimmed.slice(index + 1).trim();
  }
}

const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const problems = [];
const platformArg = process.argv.find((arg) => arg.startsWith('--platform='));
const platform = platformArg ? platformArg.split('=')[1] : 'all';
if (!['all', 'ios', 'android'].includes(platform)) problems.push(`Unknown platform: ${platform}`);
const required = [
  'EXPO_PUBLIC_PROXY_URL',
  'EXPO_PUBLIC_PRIVACY_URL',
  'EXPO_PUBLIC_TERMS_URL',
  'EXPO_PUBLIC_SUPPORT_URL',
  'EXPO_PUBLIC_SUPPORT_EMAIL',
  'EXPO_PUBLIC_DELETE_ACCOUNT_URL',
];
const authProvider = (env.EXPO_PUBLIC_AUTH_PROVIDER || 'firebase').trim().toLowerCase();
if (authProvider === 'supabase') required.push('EXPO_PUBLIC_SUPABASE_URL','EXPO_PUBLIC_SUPABASE_ANON_KEY','EXPO_PUBLIC_AUTH_REDIRECT_URL','EXPO_PUBLIC_PASSWORD_RESET_URL');
else if (authProvider === 'firebase') required.push('EXPO_PUBLIC_FIREBASE_API_KEY','EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN','EXPO_PUBLIC_FIREBASE_PROJECT_ID','EXPO_PUBLIC_FIREBASE_APP_ID');
else problems.push('EXPO_PUBLIC_AUTH_PROVIDER must be firebase or supabase');
if (platform !== 'android') required.push('EXPO_PUBLIC_REVENUECAT_IOS_KEY');
if (platform !== 'ios') required.push('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY');
for (const key of required) if (!env[key]) problems.push(`${key} is missing in .env`);
if (/localhost|127\.0\.0\.1|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\./i.test(env.EXPO_PUBLIC_PROXY_URL || '')) problems.push('EXPO_PUBLIC_PROXY_URL must be a public HTTPS URL, not localhost/LAN');
if (env.EXPO_PUBLIC_PROXY_URL && !env.EXPO_PUBLIC_PROXY_URL.startsWith('https://')) problems.push('EXPO_PUBLIC_PROXY_URL must use HTTPS for store builds');
if (env.EXPO_PUBLIC_SUPABASE_URL && !env.EXPO_PUBLIC_SUPABASE_URL.startsWith('https://')) problems.push('EXPO_PUBLIC_SUPABASE_URL must use HTTPS');
if (env.EXPO_PUBLIC_REVENUECAT_IOS_KEY && !env.EXPO_PUBLIC_REVENUECAT_IOS_KEY.startsWith('appl_')) problems.push('EXPO_PUBLIC_REVENUECAT_IOS_KEY does not look like an iOS public SDK key');
if (env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY && !env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY.startsWith('goog_')) problems.push('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY does not look like an Android public SDK key');
for (const [key, value] of Object.entries(env)) {
  if (key.startsWith('EXPO_PUBLIC_') && /YOUR_|YOUR_PROJECT|XXXXXXXX|api\.example\.com|app\.example\.com|you@example\.com/i.test(String(value || ''))) problems.push(`${key} still contains a placeholder value`);
}

if (!app.ios?.bundleIdentifier) problems.push('expo.ios.bundleIdentifier is missing');
if (!app.android?.package) problems.push('expo.android.package is missing');
if (!app.ios?.buildNumber) problems.push('expo.ios.buildNumber is missing');
if (!app.android?.versionCode) problems.push('expo.android.versionCode is missing');

for (const key of ['EXPO_PUBLIC_PRIVACY_URL', 'EXPO_PUBLIC_TERMS_URL', 'EXPO_PUBLIC_SUPPORT_URL', 'EXPO_PUBLIC_DELETE_ACCOUNT_URL']) {
  if (env[key] && !env[key].startsWith('https://')) problems.push(`${key} must use HTTPS`);
}
if (env.EXPO_PUBLIC_AUTH_REDIRECT_URL && !env.EXPO_PUBLIC_AUTH_REDIRECT_URL.startsWith('newssummarizer://') && !env.EXPO_PUBLIC_AUTH_REDIRECT_URL.startsWith('https://')) problems.push('EXPO_PUBLIC_AUTH_REDIRECT_URL must use the app scheme or HTTPS');
if (env.EXPO_PUBLIC_PASSWORD_RESET_URL && !env.EXPO_PUBLIC_PASSWORD_RESET_URL.startsWith('newssummarizer://') && !env.EXPO_PUBLIC_PASSWORD_RESET_URL.startsWith('https://')) problems.push('EXPO_PUBLIC_PASSWORD_RESET_URL must use the app scheme or HTTPS');
if (authProvider === 'firebase' && env.EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED === 'true' && !app.ios?.usesAppleSignIn) problems.push('expo.ios.usesAppleSignIn must be true when Sign in with Apple is enabled');
if (env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID && !env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.endsWith('.apps.googleusercontent.com')) problems.push('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID must end with .apps.googleusercontent.com');
if (env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID && !env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID.endsWith('.apps.googleusercontent.com')) problems.push('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must end with .apps.googleusercontent.com');
if (env.EXPO_PUBLIC_SUPPORT_EMAIL && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.EXPO_PUBLIC_SUPPORT_EMAIL)) problems.push('EXPO_PUBLIC_SUPPORT_EMAIL must be a valid email address');
if (app.ios?.bundleIdentifier && app.ios.bundleIdentifier !== app.ios.bundleIdentifier.toLowerCase()) problems.push('iOS bundleIdentifier should be lowercase');
if (app.android?.package && app.android.package !== app.android.package.toLowerCase()) problems.push('Android package should be lowercase');
if (app.ios?.bundleIdentifier && app.android?.package && app.ios.bundleIdentifier !== app.android.package) problems.push('iOS bundleIdentifier and Android package should match for this project');

if (problems.length) {
  console.error('\nRelease check failed:\n- ' + problems.join('\n- ') + '\n');
  process.exit(1);
}
console.log('Release configuration looks complete. Run TypeScript/tests and then EAS production builds.');
