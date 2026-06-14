// ---------------------------------------------------------------------------
// Auth context, provider, hooks, and route guards
// ---------------------------------------------------------------------------

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { authClient, getJwt } from "./auth-client";
import type { SessionData, ProfileData } from "./types";

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
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionData | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const { data } = await authClient.getSession();
      if (!data?.session) {
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      const jwt = await getJwt();
      if (!jwt) {
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
        setProfile(d.profile ?? null);
      } catch {
        setProfile(null);
      }
      setLoading(false);
    } catch {
      setSession(null);
      setProfile(null);
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);

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
