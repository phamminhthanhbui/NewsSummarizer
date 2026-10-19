import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  authConfigured,
  consumeAuthUrl,
  deleteAccount,
  getSession,
  onAuthChange,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from '../services/auth';
import { identifyPurchasesUser } from '../services/subscription';

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signIn: typeof signIn;
  signUp: typeof signUp;
  signOut: typeof signOut;
  requestPasswordReset: typeof requestPasswordReset;
  updatePassword: typeof updatePassword;
  deleteAccount: typeof deleteAccount;
  consumeAuthUrl: typeof consumeAuthUrl;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getSession()
      .then((next) => { if (alive) setSession(next); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    const unsubscribe = onAuthChange((next) => {
      setSession(next);
      setLoading(false);
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (loading) return;
    void identifyPurchasesUser(session?.user?.id || null, session?.user?.email || null).catch(() => {});
  }, [loading, session?.user?.id, session?.user?.email]);

  const value = useMemo<AuthContextValue>(() => ({
    configured: authConfigured,
    loading,
    session,
    user: session?.user || null,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    updatePassword,
    deleteAccount,
    consumeAuthUrl,
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
