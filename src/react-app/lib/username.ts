// ---------------------------------------------------------------------------
// Username helpers
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;
const RESERVED_USERNAMES = new Set([
  "api", "avatars", "signin", "signup", "create", "settings", "analytics", "admin",
]);

export function validateUsername(u: string): string | null {
  if (u.length < 3) return "Minimum 3 characters";
  if (u.length > 30) return "Maximum 30 characters";
  if (!USERNAME_RE.test(u))
    return "Lowercase letters, numbers, hyphens, underscores — must start and end with a letter or number";
  if (RESERVED_USERNAMES.has(u)) return "Username is reserved";
  return null;
}

export function useUsernameCheck(username: string) {
  const [status, setStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");

  useEffect(() => {
    if (!username) { setStatus("idle"); return; }
    if (validateUsername(username)) { setStatus("invalid"); return; }
    setStatus("checking");
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username/${encodeURIComponent(username)}/available`);
        const d = await res.json();
        setStatus(d.available ? "available" : "taken");
      } catch {
        setStatus("idle");
      }
    }, 350);
    return () => clearTimeout(id);
  }, [username]);

  return status;
}
