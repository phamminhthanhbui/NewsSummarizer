import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  // Firebase's TypeScript types select the browser build on Windows/Node; Metro
  // selects its React Native build, where this official API exists.
  // @ts-expect-error Conditional RN export is missing from browser .d.ts
  getReactNativePersistence,
  initializeAuth,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword as firebaseUpdatePassword,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import { normalizeEmail } from './authValidation';
import { googleNativeAvailable, signInWithNativeGoogle, signOutNativeGoogle } from './googleSignIn';

// Client-side Firebase configuration is public, not a service account/private key.
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim() || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim() || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim() || '',
};
export const firebaseAuthConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

// Web Google sign-in runs through Firebase's popup. Native Google uses the
// dedicated Google Sign-In SDK and exchanges its ID token with Firebase.
export const googleSignInAvailable = firebaseAuthConfigured && (Platform.OS === 'web' || googleNativeAvailable);
// Apple sign-in is opt-in: the Firebase Apple provider and the iOS capability
// must both be configured before setting EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED=true.
const appleSignInEnabled = process.env.EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED?.trim().toLowerCase() === 'true';
export const appleSignInAvailable = appleSignInEnabled && firebaseAuthConfigured && (Platform.OS === 'web' || Platform.OS === 'ios');

export type FirebaseAuthUser = {
  id: string;
  email: string | null;
  user_metadata: { display_name?: string };
  emailVerified: boolean;
};
export type FirebaseSession = { user: FirebaseAuthUser };

let instance: Auth | null = null;
function client(): Auth {
  if (!firebaseAuthConfigured) {
    throw new Error('Chưa cấu hình Firebase. Hãy thêm Firebase Web App config vào .env.');
  }
  if (instance) return instance;
  const app = getApps().find((value) => value.name === 'newssummarizer-auth')
    || initializeApp(config, 'newssummarizer-auth');
  if (Platform.OS === 'web') {
    instance = getAuth(app);
  } else {
    // RN/Expo: session survives a full app restart using AsyncStorage v2.
    try {
      instance = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
    } catch (error) {
      // Only accept an already initialized Firebase Auth instance (Fast Refresh).
      if ((error as { code?: string }).code !== 'auth/already-initialized') throw error;
      instance = getAuth(app);
    }
  }
  return instance;
}

// Google/Apple already verify the email address at the identity provider, so a
// federated account must not be locked out waiting for a verification email.
function isFederated(user: User) {
  return user.providerData.some((provider) => provider.providerId === 'google.com' || provider.providerId === 'apple.com');
}

function convert(user: User | null): FirebaseSession | null {
  if (!user) return null;
  const verified = user.emailVerified || isFederated(user);
  return verified ? {
    user: {
      id: user.uid,
      email: user.email,
      user_metadata: { display_name: user.displayName || undefined },
      emailVerified: true,
    },
  } : null;
}

// Cached user fields can be stale (email verification happens in a browser).
// Reload first, but keep the cached session when the device is offline.
async function currentSession(user: User | null): Promise<FirebaseSession | null> {
  if (!user) return null;
  try {
    await reload(user);
  } catch {
    // Offline: use Firebase's cached user instead of signing the reader out.
  }
  return convert(user);
}

export async function getSession(): Promise<FirebaseSession | null> {
  if (!firebaseAuthConfigured) return null;
  const auth = client();
  await auth.authStateReady();
  return currentSession(auth.currentUser);
}

export async function refreshSession(): Promise<FirebaseSession | null> {
  if (!firebaseAuthConfigured) return null;
  return currentSession(client().currentUser);
}

export function onAuthChange(callback: (session: FirebaseSession | null) => void) {
  if (!firebaseAuthConfigured) return () => {};
  return onAuthStateChanged(client(), (user) => callback(convert(user)));
}

export async function signUp(email: string, password: string, name: string) {
  const auth = client();
  const credential = await createUserWithEmailAndPassword(auth, normalizeEmail(email), password);
  try {
    if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
    await sendEmailVerification(credential.user);
  } finally {
    // Keep accounts pending until the user confirms their address.
    await firebaseSignOut(auth);
  }
  return { session: null, user: convert(credential.user)?.user || null };
}

export async function signIn(email: string, password: string) {
  const auth = client();
  const credential = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
  await reload(credential.user);
  if (!credential.user.emailVerified) {
    await firebaseSignOut(auth);
    throw new Error('auth/email-not-verified');
  }
  return { session: convert(credential.user) };
}

export async function resendVerification(email: string, password: string) {
  const auth = client();
  const credential = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
  try {
    if (credential.user.emailVerified) throw new Error('auth/email-already-verified');
    await sendEmailVerification(credential.user);
  } finally {
    await firebaseSignOut(auth);
  }
}

export async function signOut() {
  await signOutNativeGoogle();
  await firebaseSignOut(client());
}

export async function requestPasswordReset(email: string) {
  // Firebase's built-in reset flow opens its secure hosted reset page.
  await sendPasswordResetEmail(client(), normalizeEmail(email));
}

export async function updatePassword(password: string) {
  const user = client().currentUser;
  if (!user) throw new Error('Bạn cần đăng nhập để đổi mật khẩu.');
  await firebaseUpdatePassword(user, password);
}

export async function deleteAccount() {
  const auth = client();
  const user = auth.currentUser;
  if (!user) throw new Error('Bạn cần đăng nhập để xóa tài khoản.');
  // Firebase may require recent sign-in; show re-authentication guidance in UI.
  await deleteUser(user);
}

async function finishSocialSignIn(user: User) {
  await reload(user);
  const session = convert(user);
  if (!session) {
    await firebaseSignOut(client());
    throw new Error('auth/email-not-verified');
  }
  return { session };
}

// Web uses Firebase's popup because the browser build owns the OAuth window.
// The React Native build of firebase/auth does not export popup helpers, so the
// native branch below handles Apple with the system sheet instead.
async function signInWithWebPopup(provider: 'google' | 'apple') {
  const { GoogleAuthProvider, OAuthProvider, signInWithPopup } = require('firebase/auth') as typeof import('firebase/auth');
  const authProvider = provider === 'google' ? new GoogleAuthProvider() : new OAuthProvider('apple.com');
  if (provider === 'apple') {
    authProvider.addScope('email');
    authProvider.addScope('name');
  }
  const credential = await signInWithPopup(client(), authProvider);
  return finishSocialSignIn(credential.user);
}

async function signInWithNativeApple() {
  if (Platform.OS !== 'ios') throw new Error('auth/social-not-configured');
  const AppleAuthentication = require('expo-apple-authentication') as typeof import('expo-apple-authentication');
  const Crypto = require('expo-crypto') as typeof import('expo-crypto');
  if (!(await AppleAuthentication.isAvailableAsync())) throw new Error('auth/social-not-configured');
  // Firebase expects the SHA-256 hash of the nonce in the Apple request and the
  // original nonce when building the credential.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL, AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
    nonce: hashedNonce,
  });
  if (!appleCredential.identityToken) throw new Error('auth/invalid-credential');
  const { OAuthProvider, signInWithCredential } = require('firebase/auth') as typeof import('firebase/auth');
  const provider = new OAuthProvider('apple.com');
  const credential = await signInWithCredential(client(), provider.credential({ idToken: appleCredential.identityToken, rawNonce }));
  const name = [appleCredential.fullName?.givenName, appleCredential.fullName?.familyName].filter(Boolean).join(' ');
  if (name && !credential.user.displayName) {
    await updateProfile(credential.user, { displayName: name });
  }
  return finishSocialSignIn(credential.user);
}

export async function signInWithGoogle() {
  if (Platform.OS === 'web') return signInWithWebPopup('google');
  const idToken = await signInWithNativeGoogle();
  const { GoogleAuthProvider, signInWithCredential } = require('firebase/auth') as typeof import('firebase/auth');
  const credential = await signInWithCredential(client(), GoogleAuthProvider.credential(idToken));
  return finishSocialSignIn(credential.user);
}

export async function signInWithApple() {
  if (!appleSignInEnabled) throw new Error('auth/social-not-configured');
  if (Platform.OS === 'web') return signInWithWebPopup('apple');
  if (Platform.OS === 'ios') return signInWithNativeApple();
  throw new Error('auth/social-not-configured');
}

// Verification/reset emails use Firebase's hosted action pages, not Supabase deep links.
export async function consumeAuthUrl(_url: string) {
  return { handled: false, recovery: false };
}
