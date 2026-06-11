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
import {
  Globe, Mail, Phone, MapPin,
  Music, Mic, Headphones, Camera,
  ShoppingBag, Coffee, Heart, Star, Rss,
  Link as LinkIcon,
} from "lucide-react";
import {
  SiYoutube, SiInstagram, SiFacebook, SiX, SiTwitch,
  SiSpotify, SiBandcamp, SiSoundcloud,
} from "react-icons/si";
import { authClient, getJwt } from "./auth-client";

// ---------------------------------------------------------------------------
// Icon system
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  // Brand
  YouTube: SiYoutube,
  Instagram: SiInstagram,
  Facebook: SiFacebook,
  Twitter: SiX,
  Twitch: SiTwitch,
  Spotify: SiSpotify,
  Bandcamp: SiBandcamp,
  SoundCloud: SiSoundcloud,
  // General
  Globe, Mail, Phone, MapPin,
  Music, Mic, Headphones, Camera,
  ShoppingBag, Coffee, Heart, Star, Rss,
  Link: LinkIcon,
};

const ICON_OPTIONS = Object.keys(ICON_MAP);

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const Component = ICON_MAP[name];
  if (!Component) return null;
  return <Component size={size} />;
}

function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        {value ? <><Icon name={value} /> {value}</> : "— None —"}
        {" ▾"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 10,
            background: "white",
            border: "1px solid #ccc",
            padding: 8,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 4,
            width: 260,
          }}
        >
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            style={{ gridColumn: "1 / -1", textAlign: "left", padding: "4px 6px" }}
          >
            — None —
          </button>
          {ICON_OPTIONS.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => { onChange(name); setOpen(false); }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: "6px 4px",
                fontSize: 10,
                background: value === name ? "#eee" : "transparent",
                border: value === name ? "1px solid #999" : "1px solid transparent",
                cursor: "pointer",
              }}
            >
              <Icon name={name} size={18} />
              {name}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionData = { token: string; name: string };
type ProfileData = { username: string; display_name: string };
type DraftLink = { title: string; url: string; icon?: string };
type Draft = { links: DraftLink[] };

// ---------------------------------------------------------------------------
// Auth context
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

function useAuth() {
  return useContext(AuthContext);
}

// ---------------------------------------------------------------------------
// Route guards
// ---------------------------------------------------------------------------

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { loading, session } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireProfile({ children }: { children: React.ReactNode }) {
  const { loading, session, profile } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!session) return <Navigate to="/signin" replace />;
  if (!profile) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RedirectIfHasProfile({ children }: { children: React.ReactNode }) {
  const { loading, session, profile } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (session && profile) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Draft — localStorage buffer for the page builder
// ---------------------------------------------------------------------------

const DRAFT_KEY = "loulink_draft";
const EMPTY_DRAFT: Draft = { links: [] };

function getDraft(): Draft {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") ?? EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

function saveDraft(d: Partial<Draft>) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...getDraft(), ...d }));
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
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

// ---------------------------------------------------------------------------
// Home — landing page
// ---------------------------------------------------------------------------

function Home() {
  return (
    <>
      <h1>LouLink</h1>
      <p>
        A free resource for Louisville artists and businesses to compile their
        internet presences in a public repertoire of their peers.
      </p>
      <p>
        <Link to="/signin">Sign in</Link>
        {" · "}
        <Link to="/signup">Sign up</Link>
        {" · "}
        <Link to="/create">Create</Link>
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Create — link builder (no account required)
// ---------------------------------------------------------------------------

function CreatePage() {
  const navigate = useNavigate();
  const [links, setLinks] = useState<DraftLink[]>(() => getDraft().links ?? []);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkIcon, setLinkIcon] = useState<string>("");

  function updateLinks(next: DraftLink[]) {
    setLinks(next);
    saveDraft({ links: next });
  }

  function addLink() {
    const title = linkTitle.trim();
    const raw = linkUrl.trim();
    if (!title || !raw) return;
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let url: string;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
      url = candidate;
    } catch {
      return;
    }
    updateLinks([...links, { title, url, icon: linkIcon || undefined }]);
    setLinkTitle("");
    setLinkUrl("");
    setLinkIcon("");
  }

  function removeLink(i: number) {
    updateLinks(links.filter((_, idx) => idx !== i));
  }

  return (
    <>
      <h1>Build your page</h1>
      <p>Add your links below. You can create an account when you're ready to save.</p>

      {links.length > 0 && (
        <ul>
          {links.map((l, i) => (
            <li key={i}>
              {l.icon && <><Icon name={l.icon} /> </>}
              <strong>{l.title}</strong> — {l.url}{" "}
              <button type="button" onClick={() => removeLink(i)}>Remove</button>
            </li>
          ))}
        </ul>
      )}

      <p>
        <label>
          Title<br />
          <input
            type="text"
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
            placeholder="e.g. My Bandcamp"
          />
        </label>
      </p>
      <p>
        <label>
          URL<br />
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="e.g. bandcamp.com/yourbandname"
          />
        </label>
      </p>
      <p>
        <label>
          Icon<br />
          <IconPicker value={linkIcon} onChange={setLinkIcon} />
        </label>
      </p>
      <p>
        <button
          type="button"
          onClick={addLink}
          disabled={!linkTitle.trim() || !linkUrl.trim()}
        >
          Add link
        </button>
      </p>

      <p>
        <button type="button" onClick={() => navigate("/signup")}>
          Create account to save →
        </button>
      </p>
      <p>
        Already have an account? <Link to="/signin">Sign in</Link>
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Auth pages
// ---------------------------------------------------------------------------

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
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const checkStatus = useUsernameCheck(username);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const usernameValid = checkStatus === "available" && !validateUsername(username);
  const canSubmit =
    displayName.trim().length > 0 &&
    usernameValid &&
    emailValid &&
    password.length >= 8 &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");

    const { error: signUpError } = await authClient.signUp.email({
      name: displayName,
      email,
      password,
    });
    if (signUpError) {
      setError(signUpError.message ?? "Sign up failed.");
      setSubmitting(false);
      return;
    }

    const { data } = await authClient.getSession();
    if (!data?.session) {
      setError("Could not establish session after sign up.");
      setSubmitting(false);
      return;
    }

    const jwt = await getJwt();
    if (!jwt) {
      setError("Could not obtain auth token after sign up.");
      setSubmitting(false);
      return;
    }

    const draft = getDraft();
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        username,
        display_name: displayName.trim(),
        links: draft.links ?? [],
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Failed to create profile.");
      setSubmitting(false);
      return;
    }

    clearDraft();
    await loadSession();
    navigate("/");
  }

  return (
    <>
      <h1>Create your account</h1>
      <form onSubmit={handleSubmit}>
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
        <p>
          <label>
            Username (loul.ink/…)<br />
            <input
              type="text"
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
              }
              required
            />
          </label>
          {username && (
            <span>
              {" "}
              {checkStatus === "checking" && "Checking…"}
              {checkStatus === "available" && "✓ Available"}
              {checkStatus === "taken" && "✗ Taken"}
              {checkStatus === "invalid" && (validateUsername(username) ?? "Invalid")}
            </span>
          )}
        </p>
        <p>
          <label>
            Email<br />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {email && (
            <span>
              {" "}
              {emailValid ? "✓ Valid" : "✗ Invalid email"}
            </span>
          )}
        </p>
        <p>
          <label>
            Password<br />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {password && (
            <span>
              {" "}
              {password.length >= 8 ? "✓ Good" : `✗ Too short (${password.length}/8)`}
            </span>
          )}
        </p>
        {error && <p><strong>{error}</strong></p>}
        <p><button type="submit" disabled={!canSubmit}>Create account</button></p>
      </form>
      <p>
        <Link to="/">Back</Link> &middot; <Link to="/signin">Sign in instead</Link>
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  if (!profile) return null;

  return (
    <>
      <h1>Welcome, {profile.display_name}</h1>
      <p>
        Your profile:{" "}
        <a href={`https://loul.ink/${profile.username}`} target="_blank" rel="noreferrer">
          loul.ink/{profile.username}
        </a>
      </p>
      <p>
        <Link to="/settings">Settings</Link>
        {" · "}
        <button onClick={async () => { await signOut(); navigate("/"); }}>
          Sign out
        </button>
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

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
      <p>Current username: <strong>{profile.username}</strong></p>
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
        {success && <p>Username updated to <strong>{username}</strong>!</p>}
        <p>
          <button type="submit" disabled={!canSubmit}>Update username</button>
        </p>
      </form>
      <p><Link to="/">Back to dashboard</Link></p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Index route
// ---------------------------------------------------------------------------

function IndexRoute() {
  const { loading, session, profile } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (session && profile) return <Dashboard />;
  return <Home />;
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
          <Route path="/signin" element={<RedirectIfAuthed><SignIn /></RedirectIfAuthed>} />
          <Route path="/signup" element={<RedirectIfAuthed><SignUp /></RedirectIfAuthed>} />
          <Route path="/create" element={<RedirectIfHasProfile><CreatePage /></RedirectIfHasProfile>} />
          <Route path="/settings" element={<RequireProfile><Settings /></RequireProfile>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
