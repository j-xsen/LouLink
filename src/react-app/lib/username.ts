// ---------------------------------------------------------------------------
// Username helpers
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;
const RESERVED_USERNAMES = new Set([
  "api", "avatars", "signin", "signup", "create", "settings", "analytics", "admin",
  "dashboard", "forgot-password", "reset-password", "privacy",
]);

export function validateUsername(u: string): string | null {
  if (u.length < 3) return "Minimum 3 characters";
  if (u.length > 30) return "Maximum 30 characters";
  if (!USERNAME_RE.test(u))
    return "Lowercase letters, numbers, hyphens, underscores — must start and end with a letter or number";
  if (RESERVED_USERNAMES.has(u)) return "Username is reserved";
  return null;
}

export function useUsernameCheck(
  username: string
): "idle" | "checking" | "available" | "taken" | "invalid" {
  // State holds only the async lookup result, tagged with the username it was
  // fetched for; everything else derives from `username` at render time. The
  // tag also prevents a stale response from showing for a newer username.
  const [result, setResult] = useState<
    { username: string; status: "available" | "taken" | "idle" } | null
  >(null);

  useEffect(() => {
    if (!username || validateUsername(username)) return;
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username/${encodeURIComponent(username)}/available`);
        const d = await res.json();
        setResult({ username, status: d.available ? "available" : "taken" });
      } catch {
        setResult({ username, status: "idle" });
      }
    }, 350);
    return () => clearTimeout(id);
  }, [username]);

  if (!username) return "idle";
  if (validateUsername(username)) return "invalid";
  return result?.username === username ? result.status : "checking";
}
