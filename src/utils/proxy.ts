import Constants from 'expo-constants';

// Host của máy chạy Metro/Expo (hostUri = "192.168.x.x:8088" khi dev qua LAN)
function metroHost(): string {
  return (Constants.expoConfig?.hostUri || '').split(':')[0];
}

function envBase(): string | undefined {
  const v = process.env.EXPO_PUBLIC_PROXY_URL;
  return v ? v.replace(/\/+$/, '') : undefined;
}

// Base URL của proxy local (server/proxy.js, port 3001). Trả về KHÔNG có dấu / ở cuối.
// Web: LUÔN ưu tiên hostname trang đang mở (kể cả localhost) — trình duyệt chắc chắn
// tới được chính máy nó đang tải app; hostUri có thể là IP CŨ khi đổi Wi-Fi/hotspot.
export function getProxyBase(): string {
  const env = envBase();
  if (env) return env;
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:3001`;
  }
  const host = metroHost();
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:3001`;
  return 'http://localhost:3001';
}

// Danh sách candidate base theo thứ tự thử: env → cùng origin với trang web
// → IP Metro → loopback. Caller failover tuần tự cho tới khi có cái trả lời.
export function getProxyCandidates(): string[] {
  const out: string[] = [];
  const push = (b?: string) => { if (b && !out.includes(b)) out.push(b); };
  push(envBase());
  if (typeof window !== 'undefined' && window.location?.hostname) {
    push(`http://${window.location.hostname}:3001`);
    if (window.location.hostname === 'localhost') push('http://127.0.0.1:3001');
  }
  const mh = metroHost();
  if (mh) push(`http://${mh}:3001`);
  push('http://127.0.0.1:3001');
  push('http://localhost:3001');
  return out;
}

// ---- Sức khỏe từng base ----
// Candidate chết do firewall/IP-cũ thường DROP packet (không trả RST) → fetch treo
// tới tận timeout. Vì vậy: (1) mỗi candidate tự có budget ngắn, (2) base chết bị
// ghi nhớ trong vài phút để các request sau khỏi mất công thử lại.
let goodProxyBase: string | null = null;
const deadUntil = new Map<string, number>();
const DEAD_BACKOFF_MS = 3 * 60 * 1000;
const PROBE_TIMEOUT_MS = 2500;

function isDead(base: string): boolean {
  const t = deadUntil.get(base);
  return !!t && Date.now() < t;
}

function markDead(base: string): void {
  if (envBase() && base === envBase()) return; // env do người dùng set — tin tuyệt đối, không đánh dấu chết
  deadUntil.set(base, Date.now() + DEAD_BACKOFF_MS);
  if (goodProxyBase === base) goodProxyBase = null;
}

function markAlive(base: string): void {
  deadUntil.delete(base);
  goodProxyBase = base;
}

export function getGoodProxyBase(): string | null {
  return goodProxyBase && !isDead(goodProxyBase) ? goodProxyBase : null;
}

// Thứ tự thử proxy: base sống đã biết đứng đầu,
// sau đó là các candidate chưa bị đánh dấu chết.
export function orderedProxyBases(): string[] {
  const rest = getProxyCandidates().filter((b) => b !== goodProxyBase && !isDead(b));
  return goodProxyBase ? [goodProxyBase, ...rest] : rest;
}

export function markProxyDead(base: string): void { markDead(base); }
export function markProxyAlive(base: string): void { markAlive(base); }

// GET text qua /api/fetch, failover qua các candidate. Trả null khi không base nào
// sống (caller tự fallback). TimeoutMs là TỔNG budget; mỗi base tự giới hạn
// PROBE_TIMEOUT_MS để candidate chết không ăn hết ngân sách của các base sau.
export async function proxiedFetchText(targetUrl: string, timeoutMs = 8000): Promise<string | null> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (const base of orderedProxyBases()) {
      if (controller.signal.aborted) return null;
      const remaining = timeoutMs - (Date.now() - startedAt);
      if (remaining <= 300) break;
      const text = await tryGetText(base, targetUrl, controller.signal, Math.min(PROBE_TIMEOUT_MS, remaining));
      if (text !== null) return text;
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function tryGetText(
  base: string,
  targetUrl: string,
  outerSignal: AbortSignal,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  outerSignal.addEventListener('abort', onOuterAbort);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/fetch?url=${encodeURIComponent(targetUrl)}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      // Proxy TRẢ LỜI = proxy còn sống; non-ok chỉ là lỗi NỘI DUNG upstream
      // (báo chặn 403, bài 404, /api/fetch timeout 504...). Trước đây mọi non-ok
      // đều markDead → đầu độc base khỏe: 1 URL fetch lỗi cấm cả base 3 phút →
      // request sau rơi vào IP LAN cũ (firewall drop) → timeout dây dưa.
      markAlive(base);
      return null;
    }
    markAlive(base);
    return await res.text();
  } catch {
    if (!outerSignal.aborted) markDead(base);
    return null;
  } finally {
    clearTimeout(timer);
    outerSignal.removeEventListener('abort', onOuterAbort);
  }
}
