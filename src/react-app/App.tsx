import { useState, useEffect, useCallback } from "react";
import { authClient } from "./auth-client";

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;

function validateUsername(u: string): string | null {
  if (u.length < 3) return "Minimum 3 characters";
  if (u.length > 30) return "Maximum 30 characters";
  if (!USERNAME_RE.test(u))
    return "Lowercase letters, numbers, hyphens, and underscores only — must start and end with a letter or number";
  return null;
}

type SessionData = { token: string; name: string };
type ProfileData = { username: string; display_name: string };

function useUsernameCheck(username: string) {
  const [status, setStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");

  useEffect(() => {
    if (!username) {
      setStatus("idle");
      return;
    }
    if (validateUsername(username)) {
      setStatus("invalid");
      return;
    }
    setStatus("checking");
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/username/${encodeURIComponent(username)}/available`
        );
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

function Home() {
  return (
    <>
      <h1>LouLink</h1>
      <p>
        A free resource for Louisville artists and businesses to compile their
        internet presences in a public repertoire of peers.
      </p>
      <p>
        <a href="#signin">Sign in</a> &middot; <a href="#signup">Sign up</a>
      </p>
    </>
  );
}

function SignIn({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      setError(error.message ?? "Sign in failed.");
      return;
    }
    onSuccess();
  }

  return (
    <>
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit}>
        <p>
          <label>
            Email
            <br />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
        </p>
        <p>
          <label>
            Password
            <br />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        </p>
        {error && <p><strong>{error}</strong></p>}
        <p>
          <button type="submit">Sign in</button>
        </p>
      </form>
      <p>
        <a href="#">Back</a> &middot; <a href="#signup">Sign up instead</a>
      </p>
    </>
  );
}

function SignUp({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error } = await authClient.signUp.email({ name, email, password });
    if (error) {
      setError(error.message ?? "Sign up failed.");
      return;
    }
    onSuccess();
  }

  return (
    <>
      <h1>Sign up</h1>
      <form onSubmit={handleSubmit}>
        <p>
          <label>
            Name
            <br />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
        </p>
        <p>
          <label>
            Email
            <br />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
        </p>
        <p>
          <label>
            Password
            <br />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        </p>
        {error && <p><strong>{error}</strong></p>}
        <p>
          <button type="submit">Sign up</button>
        </p>
      </form>
      <p>
        <a href="#">Back</a> &middot; <a href="#signin">Sign in instead</a>
      </p>
    </>
  );
}

function Onboarding({
  token,
  userName,
  onComplete,
}: {
  token: string;
  userName: string;
  onComplete: () => void;
}) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(userName);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const checkStatus = useUsernameCheck(username);

  const validationError = username ? validateUsername(username) : null;
  const canSubmit =
    !validationError &&
    checkStatus === "available" &&
    displayName.trim().length > 0 &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ username, display_name: displayName.trim() }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    onComplete();
  }

  return (
    <>
      <h1>Choose your username</h1>
      <p>
        Your public profile will be at{" "}
        <strong>loul.ink/{username || "…"}</strong>
      </p>
      <form onSubmit={handleSubmit}>
        <p>
          <label>
            Username
            <br />
            <input
              type="text"
              value={username}
              onChange={(e) =>
                setUsername(
                  e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "")
                )
              }
              placeholder="e.g. jaxsen"
              required
            />
          </label>
          {username && (
            <span>
              {" "}
              {checkStatus === "checking" && "Checking…"}
              {checkStatus === "available" && "✓ Available"}
              {checkStatus === "taken" && "✗ Taken"}
              {checkStatus === "invalid" && (validationError ?? "Invalid")}
            </span>
          )}
        </p>
        <p>
          <label>
            Display name
            <br />
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </label>
        </p>
        {error && <p><strong>{error}</strong></p>}
        <p>
          <button type="submit" disabled={!canSubmit}>
            Create profile
          </button>
        </p>
      </form>
    </>
  );
}

function Dashboard({
  profile,
  onSignOut,
}: {
  session: SessionData;
  profile: ProfileData;
  onSignOut: () => void;
}) {
  return (
    <>
      <h1>Welcome, {profile.display_name}</h1>
      <p>
        Your profile:{" "}
        <a
          href={`https://loul.ink/${profile.username}`}
          target="_blank"
          rel="noreferrer"
        >
          loul.ink/{profile.username}
        </a>
      </p>
      <p>
        <a href="#settings">Settings</a> &middot;{" "}
        <button onClick={onSignOut}>Sign out</button>
      </p>
    </>
  );
}

function Settings({
  token,
  profile,
  onUpdate,
}: {
  token: string;
  profile: ProfileData;
  onUpdate: () => void;
}) {
  const [username, setUsername] = useState(profile.username);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const changed = username !== profile.username;
  const validationError = changed && username ? validateUsername(username) : null;
  const checkStatus = useUsernameCheck(changed ? username : "");
  const canSubmit =
    changed && !validationError && checkStatus === "available" && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    setSuccess(false);
    const res = await fetch("/api/me/username", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ username }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    setSuccess(true);
    setSubmitting(false);
    onUpdate();
  }

  return (
    <>
      <h1>Settings</h1>
      <h2>Change username</h2>
      <p>
        Current username: <strong>{profile.username}</strong>
      </p>
      <form onSubmit={handleSubmit}>
        <p>
          <label>
            New username
            <br />
            <input
              type="text"
              value={username}
              onChange={(e) =>
                setUsername(
                  e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "")
                )
              }
              required
            />
          </label>
          {changed && username && (
            <span>
              {" "}
              {checkStatus === "checking" && "Checking…"}
              {checkStatus === "available" && "✓ Available"}
              {checkStatus === "taken" && "✗ Taken"}
              {checkStatus === "invalid" && (validationError ?? "Invalid")}
            </span>
          )}
        </p>
        {error && <p><strong>{error}</strong></p>}
        {success && (
          <p>
            Username updated to <strong>{username}</strong>!
          </p>
        )}
        <p>
          <button type="submit" disabled={!canSubmit}>
            Update username
          </button>
        </p>
      </form>
      <p>
        <a href="#">Back to dashboard</a>
      </p>
    </>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionData | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const loadSession = useCallback(async () => {
    const { data } = await authClient.getSession();
    if (!data?.session) {
      setSession(null);
      setProfile(null);
      setLoading(false);
      return;
    }
    const s: SessionData = {
      token: data.session.token,
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
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  if (loading) return <p>Loading…</p>;

  if (!session) {
    if (hash === "#signin") return <SignIn onSuccess={loadSession} />;
    if (hash === "#signup") return <SignUp onSuccess={loadSession} />;
    return <Home />;
  }

  if (!profile) {
    return (
      <Onboarding
        token={session.token}
        userName={session.name}
        onComplete={loadSession}
      />
    );
  }

  if (hash === "#settings") {
    return (
      <Settings token={session.token} profile={profile} onUpdate={loadSession} />
    );
  }

  return (
    <Dashboard
      session={session}
      profile={profile}
      onSignOut={async () => {
        await authClient.signOut();
        setSession(null);
        setProfile(null);
      }}
    />
  );
}
