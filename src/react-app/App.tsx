import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { authClient } from "./auth-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionData = { token: string; name: string };
type ProfileData = { username: string; display_name: string };

type AuthContextType = {
  loading: boolean;
  session: SessionData | null;
  profile: ProfileData | null;
  loadSession: () => Promise<void>;
  signOut: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextType>({
  loading: true,
  session: null,
  profile: null,
  loadSession: async () => {},
  signOut: async () => {},
});

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionData | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);

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

  const signOut = useCallback(async () => {
    await authClient.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  return (
    <AuthContext.Provider value={{ loading, session, profile, loadSession, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  return useContext(AuthContext);
}

// ---------------------------------------------------------------------------
// Route guards
// ---------------------------------------------------------------------------

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { loading, session, profile } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (session && profile) return <Navigate to="/" replace />;
  if (session && !profile) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function RequireSession({ children }: { children: React.ReactNode }) {
  const { loading, session } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!session) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}

function RequireProfile({ children }: { children: React.ReactNode }) {
  const { loading, session, profile } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!session) return <Navigate to="/signin" replace />;
  if (!profile) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Username helpers
// ---------------------------------------------------------------------------

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;

function validateUsername(u: string): string | null {
  if (u.length < 3) return "Minimum 3 characters";
  if (u.length > 30) return "Maximum 30 characters";
  if (!USERNAME_RE.test(u))
    return "Lowercase letters, numbers, hyphens, underscores — must start and end with a letter or number";
  return null;
}

function useUsernameCheck(username: string) {
  const [status, setStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");

  useEffect(() => {
    if (!username) { setStatus("idle"); return; }
    if (validateUsername(username)) { setStatus("invalid"); return; }
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

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function Home() {
  return (
    <>
      <h1>LouLink</h1>
      <p>
        A free resource for Louisville artists and businesses to compile their
        internet presences in a public repertoire of peers.
      </p>
      <p>
        <Link to="/signin">Sign in</Link> &middot;{" "}
        <Link to="/signup">Sign up</Link>
      </p>
    </>
  );
}

function SignIn() {
  const { loadSession } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error } = await authClient.signIn.email({ email, password });
    if (error) { setError(error.message ?? "Sign in failed."); return; }
    await loadSession();
    navigate("/");
  }

  return (
    <>
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit}>
        <p>
          <label>
            Email<br />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
        </p>
        <p>
          <label>
            Password<br />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
        </p>
        {error && <p><strong>{error}</strong></p>}
        <p><button type="submit">Sign in</button></p>
      </form>
      <p>
        <Link to="/">Back</Link> &middot; <Link to="/signup">Sign up instead</Link>
      </p>
    </>
  );
}

function SignUp() {
  const { loadSession } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error } = await authClient.signUp.email({
      name: displayName,
      email,
      password,
    });
    if (error) { setError(error.message ?? "Sign up failed."); return; }
    await loadSession();
    navigate("/onboarding");
  }

  return (
    <>
      <h1>Sign up</h1>
      <form onSubmit={handleSubmit}>
        <p>
          <label>
            Display name<br />
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Jaxsen Honeycutt"
              required
            />
          </label>
        </p>
        <p>
          <label>
            Email<br />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
        </p>
        <p>
          <label>
            Password<br />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
        </p>
        {error && <p><strong>{error}</strong></p>}
        <p><button type="submit">Sign up</button></p>
      </form>
      <p>
        <Link to="/">Back</Link> &middot; <Link to="/signin">Sign in instead</Link>
      </p>
    </>
  );
}

function Onboarding() {
  const { session, loadSession } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(session?.name ?? "");
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
    if (!canSubmit || !session) return;
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ username, display_name: displayName.trim() }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    await loadSession();
    navigate("/");
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
            Username<br />
            <input
              type="text"
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
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
            Display name<br />
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

function Dashboard() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  if (!profile) return null;

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
        <Link to="/settings">Settings</Link> &middot;{" "}
        <button
          onClick={async () => {
            await signOut();
            navigate("/");
          }}
        >
          Sign out
        </button>
      </p>
    </>
  );
}

function Settings() {
  const { session, profile, loadSession } = useAuth();
  const [username, setUsername] = useState(profile?.username ?? "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const changed = username !== profile?.username;
  const validationError = changed && username ? validateUsername(username) : null;
  const checkStatus = useUsernameCheck(changed ? username : "");
  const canSubmit =
    changed && !validationError && checkStatus === "available" && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !session) return;
    setSubmitting(true);
    setError("");
    setSuccess(false);
    const res = await fetch("/api/me/username", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
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
    await loadSession();
  }

  if (!profile) return null;

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
            New username<br />
            <input
              type="text"
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
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
          <p>Username updated to <strong>{username}</strong>!</p>
        )}
        <p>
          <button type="submit" disabled={!canSubmit}>
            Update username
          </button>
        </p>
      </form>
      <p>
        <Link to="/">Back to dashboard</Link>
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Index route — decides what to show at /
// ---------------------------------------------------------------------------

function IndexRoute() {
  const { loading, session, profile } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!session) return <Home />;
  if (!profile) return <Navigate to="/onboarding" replace />;
  return <Dashboard />;
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<IndexRoute />} />
          <Route
            path="/signin"
            element={<RedirectIfAuthed><SignIn /></RedirectIfAuthed>}
          />
          <Route
            path="/signup"
            element={<RedirectIfAuthed><SignUp /></RedirectIfAuthed>}
          />
          <Route
            path="/onboarding"
            element={<RequireSession><Onboarding /></RequireSession>}
          />
          <Route
            path="/settings"
            element={<RequireProfile><Settings /></RequireProfile>}
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
