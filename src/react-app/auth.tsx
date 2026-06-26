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
// skip the loading screen entirely on page refresh.
// TTL is derived from the JWT's own exp claim so the cache is valid for the
// full token lifetime rather than an arbitrary constant.
// ---------------------------------------------------------------------------

const AUTH_KEY = "loulink_auth_v2";

type AuthSnapshot = { token: string; name: string; email: string; profile: ProfileData | null; exp: number };

function jwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch { return null; }
}

function readAuthSnapshot(): AuthSnapshot | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as AuthSnapshot;
    // Expire 60s before the JWT itself expires so we never hand the Worker a stale token.
    if (Date.now() >= (snap.exp - 60) * 1000) { localStorage.removeItem(AUTH_KEY); return null; }
    return snap;
  } catch { return null; }
}

function writeAuthSnapshot(token: string, name: string, email: string, profile: ProfileData | null) {
  try {
    const exp = jwtExp(token);
    if (!exp) return;
    localStorage.setItem(AUTH_KEY, JSON.stringify({ token, name, email, profile, exp }));
  } catch {}
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
  loadSession: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  loading: true,
  session: null,
  profile: null,
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

  const loadSession = useCallback(async () => {
    try {
      // Fast path: if we have a cached token, verify it with /api/me directly —
      // skips the Neon auth chain (get-session → token) on every return visit.
      const cached = readAuthSnapshot();
      if (cached) {
        const meRes = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${cached.token}` },
        });
        if (meRes.ok) {
          const d = await meRes.json();
          const p: ProfileData | null = d.profile ?? null;
          setSession({ token: cached.token, name: cached.name, email: cached.email });
          setProfile(p);
          writeAuthSnapshot(cached.token, cached.name, cached.email, p);
          setLoading(false);
          return;
        }
        // 401 means the JWT expired — fall through to the full Neon auth flow.
        clearAuthSnapshot();
        setSession(null);
        setProfile(null);
      }

      const [{ data }, jwt] = await Promise.all([
        authClient.getSession(),
        getJwt().catch(() => null),
      ]);
      if (!data?.session || !jwt) {
        clearAuthSnapshot();
        setSession(null);
        setProfile(null);
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
      try {
        const meRes = await fetch("/api/me", { headers: { Authorization: `Bearer ${s.token}` } });
        const d = await meRes.json();
        p = d.profile ?? null;
      } catch {
        p = null;
      }
      setProfile(p);
      writeAuthSnapshot(jwt, s.name, s.email, p);
      setLoading(false);
    } catch {
      clearAuthSnapshot();
      setSession(null);
      setProfile(null);
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    clearDraft();
    clearAuthSnapshot();
    setSession(null);
    setProfile(null);
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
    <AuthContext.Provider value={{ loading, session, profile, loadSession, signOut }}>
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
