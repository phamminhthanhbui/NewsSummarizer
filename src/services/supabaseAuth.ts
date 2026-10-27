import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient, type Session, type User } from '@supabase/supabase-js';
import { normalizeEmail } from './authValidation';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
export const authConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const supabase = authConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

function requireClient() {
  if (!supabase) throw new Error('Đăng nhập chưa được cấu hình. Hãy thêm Supabase URL và publishable key vào .env.');
  return supabase;
}

function authRedirectUrl() {
  // On web always return to the SPA root: static hosts do not necessarily
  // rewrite /auth/callback to index.html, and the root is guaranteed to load.
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/?auth=callback`;
  const configured = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL?.trim();
  return configured || 'newssummarizer://auth/callback';
}

function resetRedirectUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/?auth=reset`;
  const configured = process.env.EXPO_PUBLIC_PASSWORD_RESET_URL?.trim();
  return configured || 'newssummarizer://auth/reset';
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthChange(callback: (session: Session | null) => void) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string) {
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email: normalizeEmail(email), password });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string, displayName: string) {
  const client = requireClient();
  const { data, error } = await client.auth.signUp({
    email: normalizeEmail(email),
    password,
    options: {
      data: { display_name: displayName.trim() || undefined },
      emailRedirectTo: authRedirectUrl(),
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const client = requireClient();
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  const client = requireClient();
  const { error } = await client.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo: resetRedirectUrl() });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const client = requireClient();
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}

function paramsFromAuthUrl(url: string) {
  const [base, hash = ''] = url.split('#');
  const query = new URL(base).searchParams;
  const fragment = new URLSearchParams(hash);
  const get = (key: string) => query.get(key) || fragment.get(key);
  return {
    code: get('code'),
    accessToken: get('access_token'),
    refreshToken: get('refresh_token'),
    type: get('type'),
    flow: get('auth'),
  };
}

export async function consumeAuthUrl(url: string): Promise<{ handled: boolean; recovery: boolean }> {
  if (!supabase || !url) return { handled: false, recovery: false };
  const params = paramsFromAuthUrl(url);
  const recovery = params.type === 'recovery' || params.flow === 'reset' || url.includes('/auth/reset');
  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return { handled: true, recovery };
  }
  if (params.accessToken && params.refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: params.accessToken, refresh_token: params.refreshToken });
    if (error) throw error;
    return { handled: true, recovery };
  }
  return { handled: false, recovery: false };
}

export async function deleteAccount() {
  const client = requireClient();
  const { error } = await client.functions.invoke('delete-account', { body: {} });
  if (error) throw error;
  await client.auth.signOut({ scope: 'local' });
}

export function displayName(user: User | null | undefined) {
  if (!user) return 'Bạn đọc';
  return user.user_metadata?.display_name || user.email?.split('@')[0] || 'Bạn đọc';
}
