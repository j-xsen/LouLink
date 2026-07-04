// ---------------------------------------------------------------------------
// Auth context + useAuth hook — kept out of auth.tsx so that file exports
// only components and stays compatible with Vite fast refresh.
// ---------------------------------------------------------------------------

import { createContext, useContext } from "react";
import type { SessionData, ProfileData } from "./types";

export type AuthContextType = {
  loading: boolean;
  session: SessionData | null;
  profile: ProfileData | null;
  loadSession: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType>({
  loading: true,
  session: null,
  profile: null,
  loadSession: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
