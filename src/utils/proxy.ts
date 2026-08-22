import Constants from 'expo-constants';

// Resolve base URL của proxy local (server/proxy.js, port 3001):
// 1. EXPO_PUBLIC_PROXY_URL nếu set (bản deploy remote)
// 2. Web mở qua IP LAN (http://192.168.x.x:8087) → dùng hostname URL đang mở
// 3. Native/Expo Go → IP LAN của máy chạy Metro (hostUri)
// 4. Fallback localhost:3001 (web local)
// Trả về KHÔNG có dấu / ở cuối.
export function getProxyBase(): string {
  if (process.env.EXPO_PUBLIC_PROXY_URL) return process.env.EXPO_PUBLIC_PROXY_URL.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const h = window.location.hostname;
    if (h && h !== 'localhost' && h !== '127.0.0.1') return `http://${h}:3001`;
  }
  const host = (Constants.expoConfig?.hostUri || '').split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:3001`;
  return 'http://localhost:3001';
}