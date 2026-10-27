import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AuthSession as Session, AuthUser as User } from '../services/auth';
import {
  appleSignInAvailable,
  authConfigured,
  consumeAuthUrl,
  deleteAccount,
  getSession,
  googleSignInAvailable,
  onAuthChange,
  passwordResetReady,
  refreshSession,
  requestPasswordReset,
  resendVerification,
  resetPasswordWithCode,
  signIn,
  signInWithApple,
  signInWithGoogle,
  signOut,
  signUp,
  updatePassword,
} from '../services/auth';
import {
  identifyPurchasesUser,
  getSubscriptionState,
  PLUS_ENTITLEMENT,
  type SubscriptionState,
} from '../services/subscription';

const emptySubscription = (): SubscriptionState => ({
  configured: false,
  active: false,
  entitlement: PLUS_ENTITLEMENT,
  managementURL: null,
  expirationDate: null,
});

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  subscription: SubscriptionState;
  subscriptionLoading: boolean;
  subscriptionError: string;
  refreshSubscription: () => Promise<void>;
  googleSignInAvailable: boolean;
  appleSignInAvailable: boolean;
  signIn: typeof signIn;
  signInWithGoogle: typeof signInWithGoogle;
  signInWithApple: typeof signInWithApple;
  signUp: typeof signUp;
  signOut: typeof signOut;
  requestPasswordReset: typeof requestPasswordReset;
  resendVerification: typeof resendVerification;
  updatePassword: typeof updatePassword;
  deleteAccount: typeof deleteAccount;
  consumeAuthUrl: typeof consumeAuthUrl;
  passwordResetReady: typeof passwordResetReady;
  resetPasswordWithCode: typeof resetPasswordWithCode;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<{ userId: string | null; state: SubscriptionState }>({
    userId: null, state: emptySubscription(),
  });
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState('');
  const identityRef = useRef<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    let alive = true;
    let receivedEvent = false;
    // Subscribe first: getSession() is only a fallback for providers that do
    // not emit an initial auth event, so an older promise can never overwrite
    // a newer sign-in/sign-out state.
    const unsubscribe = onAuthChange((next) => {
      if (!alive) return;
      receivedEvent = true;
      setSession(next);
      setLoading(false);
    });
    getSession()
      .then((next) => { if (alive && !receivedEvent) setSession(next); })
      .catch(() => {})
      .finally(() => { if (alive && !receivedEvent) setLoading(false); });
    return () => { alive = false; unsubscribe(); };
  }, []);

  // Returning from the email app or the store may change verification or
  // entitlement state without restarting the JS runtime.
  useEffect(() => {
    let alive = true;
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      refreshSession()
        .then((next) => { if (alive) setSession(next); })
        .catch(() => {});
    });
    return () => { alive = false; listener.remove(); };
  }, []);

  const userId = session?.user?.id || null;
  identityRef.current = userId;

  const refreshSubscription = useCallback(async () => {
    if (loading) return;
    const targetId = userId;
    const call = ++requestRef.current;
    setSubscriptionLoading(true);
    setSubscriptionError('');
    try {
      // Always link RevenueCat to the CURRENT authentication user before reading entitlements.
      await identifyPurchasesUser(targetId, session?.user?.email || null);
      const fetched = await getSubscriptionState();
      if (call !== requestRef.current || identityRef.current !== targetId) return;
      // Anonymous purchases must never turn a guest into a logged-in Plus user.
      setMembership({ userId: targetId, state: targetId ? fetched : { ...fetched, active: false } });
    } catch (error) {
      if (call !== requestRef.current || identityRef.current !== targetId) return;
      setMembership({ userId: targetId, state: emptySubscription() });
      setSubscriptionError(error instanceof Error ? error.message : 'Không thể kiểm tra trạng thái thuê bao.');
    } finally {
      if (call === requestRef.current && identityRef.current === targetId) setSubscriptionLoading(false);
    }
  }, [loading, userId, session?.user?.email]);

  useEffect(() => {
    if (loading) return;
    void refreshSubscription();
  }, [loading, refreshSubscription]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshSubscription();
    });
    return () => subscription.remove();
  }, [refreshSubscription]);

  // Ignore an entitlement fetched for the PREVIOUS account during login/logout.
  const subscription = membership.userId === userId
    ? membership.state
    : emptySubscription();
  const membershipLoading = loading || subscriptionLoading || membership.userId !== userId;

  const value = useMemo<AuthContextValue>(() => ({
    configured: authConfigured,
    loading,
    session,
    user: session?.user || null,
    subscription,
    subscriptionLoading: membershipLoading,
    subscriptionError,
    refreshSubscription,
    googleSignInAvailable,
    appleSignInAvailable,
    signIn, signInWithGoogle, signInWithApple, signUp, signOut,
    requestPasswordReset, resendVerification, updatePassword,
    deleteAccount, consumeAuthUrl,
    passwordResetReady, resetPasswordWithCode,
  }), [loading, session, subscription, membershipLoading, subscriptionError, refreshSubscription]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
