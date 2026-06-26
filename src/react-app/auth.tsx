// ---------------------------------------------------------------------------
// Auth context, provider, hooks, and route guards
// ---------------------------------------------------------------------------

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { authClient, getJwt } from "./auth-client";
import { clearDraft } from "./lib/draft";
import type { SessionData, ProfileData } from "./types";

// ---------------------------------------------------------------------------
// localStorage auth snapshot — stale-while-revalidate so returning users
// skip the loading screen entirely on page refresh
// ---------------------------------------------------------------------------

const AUTH_KEY = "loulink_auth";
const AUTH_TTL = 5 * 60 * 1000;

type AuthSnapshot = { token: string; name: string; email: string; profile: ProfileData | null; hasPassword: boolean };

function readAuthSnapshot(): AuthSnapshot | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > AUTH_TTL) { localStorage.removeItem(AUTH_KEY); return null; }
    return data as AuthSnapshot;
  } catch { return null; }
}

function writeAuthSnapshot(token: string, name: string, email: string, profile: ProfileData | null, hasPassword: boolean) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify({ data: { token, name, email, profile, hasPassword }, ts: Date.now() })); } catch {}
}

function clearAuthSnapshot() {
  try { localStorage.removeItem(AUTH_KEY); } catch {}
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type AuthContextType = {
  loading: boolean;
  session: SessionData | null;
  profile: ProfileData | null;
  hasPassword: boolean;
  loadSession: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  loading: true,
  session: null,
  profile: null,
  hasPassword: false,
  loadSession: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const snap = readAuthSnapshot();
  const [loading, setLoading] = useState(!snap);
  const [session, setSession] = useState<SessionData | null>(
    snap ? { token: snap.token, name: snap.name, email: snap.email ?? "" } : null
  );
  const [profile, setProfile] = useState<ProfileData | null>(snap?.profile ?? null);
  const [hasPassword, setHasPassword] = useState<boolean>(snap?.hasPassword ?? false);

  const loadSession = useCallback(async () => {
    try {
      const [{ data }, jwt] = await Promise.all([
        authClient.getSession(),
        getJwt().catch(() => null),
      ]);
      if (!data?.session || !jwt) {
        clearAuthSnapshot();
        setSession(null);
        setProfile(null);
        setHasPassword(false);
        setLoading(false);
        return;
      }
      const s: SessionData = {
        token: jwt,
        name: data.user.name ?? "",
        email: data.user.email ?? "",
      };
      setSession(s);
      let p: ProfileData | null = null;
      let pw = false;
      try {
        const [meRes, accountsRes] = await Promise.all([
          fetch("/api/me", { headers: { Authorization: `Bearer ${s.token}` } }),
          authClient.$fetch<Array<{ providerId: string }>>("/list-accounts"),
        ]);
        const d = await meRes.json();
        p = d.profile ?? null;
        pw = (accountsRes.data ?? []).some((a) => a.providerId === "credential");
      } catch {
        p = null;
        pw = false;
      }
      setProfile(p);
      setHasPassword(pw);
      writeAuthSnapshot(jwt, s.name, s.email, p, pw);
      setLoading(false);
    } catch {
      clearAuthSnapshot();
      setSession(null);
      setProfile(null);
      setHasPassword(false);
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    clearDraft();
    clearAuthSnapshot();
    setSession(null);
    setProfile(null);
    setHasPassword(false);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifier = params.get("neon_auth_session_verifier");

    if (verifier) {
      const clean = new URL(window.location.href);
      clean.searchParams.delete("neon_auth_session_verifier");
      window.history.replaceState({}, "", clean.toString());

      // Try passing the verifier as a query param to /get-session — Neon Auth explicitly
      // appends neon_auth_session_verifier to the redirect and may handle it here.
      fetch(`${import.meta.env.VITE_AUTH_URL}/get-session?neon_auth_session_verifier=${verifier}`, {
        credentials: "include",
      }).then(() => loadSession()).catch(() => loadSession());
      return;
    }

    loadSession();
  }, [loadSession]);

  return (
    <AuthContext.Provider value={{ loading, session, profile, hasPassword, loadSession, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// ---------------------------------------------------------------------------
// Route guards
// ---------------------------------------------------------------------------

export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { loading, session, profile } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (session && profile) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function RequireProfile({ children }: { children: React.ReactNode }) {
  const { loading, session, profile } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!session) return <Navigate to="/signin" replace />;
  if (!profile) return <Navigate to="/" replace />;
  return <>{children}</>;
}
