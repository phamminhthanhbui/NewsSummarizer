import type { User as SupabaseUser, Session as SupabaseSession } from '@supabase/supabase-js';
import * as supabase from './supabaseAuth';
import * as firebase from './firebaseAuth';
import { normalizeEmail } from './authValidation';

// Firebase is the active provider. Supabase stays available for projects that
// still have a reachable Supabase URL/key (set EXPO_PUBLIC_AUTH_PROVIDER=supabase).
export type AuthProviderName = 'firebase' | 'supabase';
const requestedProvider = process.env.EXPO_PUBLIC_AUTH_PROVIDER?.trim().toLowerCase();
export const AUTH_PROVIDER: AuthProviderName = requestedProvider === 'supabase' ? 'supabase' : 'firebase';
export const authConfigured = AUTH_PROVIDER === 'firebase' ? firebase.firebaseAuthConfigured : supabase.authConfigured;

// Google/Apple sign-in is implemented on the Firebase path only.
export const googleSignInAvailable = AUTH_PROVIDER === 'firebase' && firebase.googleSignInAvailable;
export const appleSignInAvailable = AUTH_PROVIDER === 'firebase' && firebase.appleSignInAvailable;

export type AuthUser = {
  id: string;
  email: string | null;
  user_metadata?: { display_name?: string } | null;
};
export type AuthSession = { user: AuthUser };

const adaptSupabase = (session: SupabaseSession | null): AuthSession | null => session ? {
  user: {
    id: session.user.id,
    email: session.user.email || null,
    user_metadata: session.user.user_metadata,
  },
} : null;

export async function getSession(): Promise<AuthSession | null> {
  if (AUTH_PROVIDER === 'firebase') return firebase.getSession();
  return adaptSupabase(await supabase.getSession());
}

// Re-read the persisted session, and on Firebase also reload the user so a
// freshly verified email unlocks the account without restarting the app.
export async function refreshSession(): Promise<AuthSession | null> {
  if (AUTH_PROVIDER === 'firebase') return firebase.refreshSession();
  return adaptSupabase(await supabase.getSession());
}

export function onAuthChange(callback: (session: AuthSession | null) => void): () => void {
  if (AUTH_PROVIDER === 'firebase') return firebase.onAuthChange(callback);
  return supabase.onAuthChange((session) => callback(adaptSupabase(session)));
}

export async function signIn(email: string, password: string) {
  return AUTH_PROVIDER === 'firebase' ? firebase.signIn(email, password) : supabase.signIn(email, password);
}

export async function signUp(email: string, password: string, displayName: string) {
  return AUTH_PROVIDER === 'firebase'
    ? firebase.signUp(email, password, displayName)
    : supabase.signUp(email, password, displayName);
}

export async function signInWithGoogle() {
  if (AUTH_PROVIDER !== 'firebase') throw new Error('auth/operation-not-allowed');
  return firebase.signInWithGoogle();
}

export async function signInWithApple() {
  if (AUTH_PROVIDER !== 'firebase') throw new Error('auth/operation-not-allowed');
  return firebase.signInWithApple();
}

export async function signOut() {
  return AUTH_PROVIDER === 'firebase' ? firebase.signOut() : supabase.signOut();
}

export async function requestPasswordReset(email: string) {
  return AUTH_PROVIDER === 'firebase' ? firebase.requestPasswordReset(email) : supabase.requestPasswordReset(email);
}

export async function resendVerification(email: string, password: string) {
  if (AUTH_PROVIDER === 'firebase') return firebase.resendVerification(email, password);
  if (!supabase.supabase) throw new Error('Chưa cấu hình xác minh email.');
  const { error } = await supabase.supabase.auth.resend({ type: 'signup', email: normalizeEmail(email) });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  return AUTH_PROVIDER === 'firebase' ? firebase.updatePassword(password) : supabase.updatePassword(password);
}

export async function deleteAccount() {
  return AUTH_PROVIDER === 'firebase' ? firebase.deleteAccount() : supabase.deleteAccount();
}

export async function consumeAuthUrl(url: string) {
  if (AUTH_PROVIDER === 'firebase') return firebase.consumeAuthUrl(url);
  const result = await supabase.consumeAuthUrl(url);
  return { ...result, verified: false };
}

export function passwordResetReady() {
  return AUTH_PROVIDER === 'firebase' ? firebase.passwordResetReady() : false;
}

export async function resetPasswordWithCode(password: string) {
  if (AUTH_PROVIDER !== 'firebase') throw new Error('auth/operation-not-allowed');
  return firebase.resetPasswordWithCode(password);
}

export function displayName(user: AuthUser | SupabaseUser | null | undefined) {
  if (!user) return 'Bạn đọc';
  return user.user_metadata?.display_name || user.email?.split('@')[0] || 'Bạn đọc';
}
