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

type AuthSnapshot = { token: string; name: string; profile: ProfileData | null };

function readAuthSnapshot(): AuthSnapshot | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > AUTH_TTL) { localStorage.removeItem(AUTH_KEY); return null; }
    return data as AuthSnapshot;
  } catch { return null; }
}

function writeAuthSnapshot(token: string, name: string, profile: ProfileData | null) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify({ data: { token, name, profile }, ts: Date.now() })); } catch {}
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
    snap ? { token: snap.token, name: snap.name } : null
  );
  const [profile, setProfile] = useState<ProfileData | null>(snap?.profile ?? null);

  const loadSession = useCallback(async () => {
    try {
      const rawRes = await fetch(`${import.meta.env.VITE_AUTH_URL}/get-session`, { credentials: "include" });
      console.log("[loadSession] raw /get-session status:", rawRes.status, "ok:", rawRes.ok);
      const rawText = await rawRes.text();
      console.log("[loadSession] raw /get-session body:", rawText.slice(0, 300));
      const { data } = await authClient.getSession();
      console.log("[loadSession] getSession data:", data);
      if (!data?.session) {
        clearAuthSnapshot();
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      const jwt = await getJwt();
      console.log("[loadSession] getJwt result:", jwt);
      if (!jwt) {
        clearAuthSnapshot();
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      const s: SessionData = {
        token: jwt,
        name: data.user.name ?? "",
      };
      setSession(s);
      try {
        const res = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${s.token}` },
        });
        const d = await res.json();
        const p = d.profile ?? null;
        setProfile(p);
        writeAuthSnapshot(jwt, s.name, p);
      } catch {
        setProfile(null);
      }
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
      }).then(r => r.text()).then(body => {
        console.log("[magic-link] get-session?verifier body:", body.slice(0, 300));
        loadSession();
      }).catch(() => loadSession());
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
