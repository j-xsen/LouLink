import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Globe, Mail, Phone, MapPin,
  Music, Mic, Headphones, Camera,
  ShoppingBag, Coffee, Heart, Star, Rss, PiggyBank, Landmark, Handshake,
  House, HouseHeart,
  GripVertical,
  Link as LinkIcon,
} from "lucide-react";
import {
  SiYoutube, SiInstagram, SiFacebook, SiX, SiTwitch,
  SiSpotify, SiBandcamp, SiSoundcloud,
} from "react-icons/si";
import NoiseEmporiumIcon from "./assets/NoiseEmporiumIcon";
import logoFullColor from "./assets/logo-full-color.svg";
import shape1 from "./assets/shape-1.svg";
import shape3 from "./assets/shape-3.svg";
import shape4 from "./assets/shape-4.svg";
import { authClient, getJwt } from "./auth-client";

// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------

function useSeo({ title, noindex = false }: { title: string; noindex?: boolean }) {
  useEffect(() => {
    document.title = title;
    const existing = document.querySelector('meta[name="robots"]');
    if (noindex) {
      if (existing) {
        existing.setAttribute("content", "noindex");
      } else {
        const meta = document.createElement("meta");
        meta.name = "robots";
        meta.content = "noindex";
        document.head.appendChild(meta);
      }
    } else if (existing) {
      existing.remove();
    }
  }, [title, noindex]);
}

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
  ShoppingBag, Coffee, Heart, Star, Rss, PiggyBank, Landmark, Handshake,
  House, HouseHeart,
  Link: LinkIcon,
  // Custom
  Emporium: NoiseEmporiumIcon,
};

const ICON_OPTIONS = Object.keys(ICON_MAP);

const BRAND_COLORS: Record<string, string> = {
  YouTube:    "#ff0000",
  Instagram:  "#c13584",
  Facebook:   "#1877f2",
  Twitter:    "#1d9bf0",
  Twitch:     "#9146ff",
  Spotify:    "#1db954",
  Bandcamp:   "#1da0c3",
  SoundCloud: "#ff5500",
};

function Icon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
  const Component = ICON_MAP[name];
  if (!Component) return null;
  return <Component size={size} style={color ? { color } : undefined} />;
}

function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-block" }}>
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
            width: 280,
          }}
        >
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
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            style={{
              gridColumn: "1 / -1",
              textAlign: "center",
              padding: "4px 6px",
              background: value === "" ? "#eee" : "transparent",
              border: value === "" ? "1px solid #999" : "1px solid transparent",
            }}
          >
            — None —
          </button>
        </div>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ShapeButton — organic SVG blob background CTA
// ---------------------------------------------------------------------------

function ShapeButton({
  to,
  href,
  onClick,
  shape,
  style,
  children,
}: {
  to?: string;
  href?: string;
  onClick?: () => void;
  shape: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const containerStyle: React.CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-start",
    minWidth: 100,
    height: 52,
    padding: "0 1rem 0 1.75rem",
    color: "#12080b",
    fontWeight: 700,
    textDecoration: "none",
    cursor: "pointer",
    border: "none",
    background: "none",
  };
  const imgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    objectPosition: "left center",
    zIndex: 0,
    pointerEvents: "none",
    transform: "translateX(-5px)",
  };
  const labelStyle: React.CSSProperties = {
    position: "relative",
    zIndex: 1,
    fontSize: "1.5rem",
    fontFamily: "'Aladin', Georgia, serif",
    paddingTop: "4px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };
  const inner = (
    <>
      <img src={shape} alt="" style={imgStyle} />
      <span style={labelStyle}>{children}</span>
    </>
  );
  const merged = { ...containerStyle, ...style };
  if (to) return <Link to={to} style={merged}>{inner}</Link>;
  if (href) return <a href={href} style={merged}>{inner}</a>;
  return <button type="button" onClick={onClick} style={merged}>{inner}</button>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionData = { token: string; name: string };
type ProfileData = { username: string; display_name: string; avatarUrl: string | null; categories: string[] };
type DraftLink = { kind: "link"; title: string; url: string; icon?: string };
type DraftHeader = { kind: "header"; title: string };
type DraftItem = DraftLink | DraftHeader;
type Draft = { items: DraftItem[] };

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
  return <>{children}</>;
}

function RequireProfile({ children }: { children: React.ReactNode }) {
  const { loading, session, profile } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!session) return <Navigate to="/signin" replace />;
  if (!profile) return <Navigate to="/" replace />;
  return <>{children}</>;
}


// ---------------------------------------------------------------------------
// Draft — localStorage buffer for the page builder
// ---------------------------------------------------------------------------

const DRAFT_KEY = "loulink_draft";
const EMPTY_DRAFT: Draft = { items: [] };

function getDraft(): Draft {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (!raw) return EMPTY_DRAFT;
    // Migrate old format: { links: [...] } → { items: [...] }
    if (Array.isArray(raw.links) && !raw.items) {
      return { items: raw.links.map((l: any) => ({ kind: "link" as const, ...l })) };
    }
    return raw ?? EMPTY_DRAFT;
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

const CATEGORY_LABELS: Record<string, string> = {
  music: "Music",
  "visual-art": "Visual Art",
  food: "Food & Drink",
  retail: "Retail",
  community: "Community",
};

type DirectoryMember = {
  username: string;
  display_name: string;
  bio: string | null;
  categories: string[];
  avatarUrl: string | null;
};

function MemberCard({ member }: { member: DirectoryMember }) {
  const labels = member.categories.map((c) => CATEGORY_LABELS[c]).filter(Boolean);
  const bio = member.bio && member.bio.length > 100 ? member.bio.slice(0, 97) + "…" : member.bio;
  return (
    <Link
      to={`/${member.username}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div
        className="link-card"
        style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem" }}
      >
        <AvatarImage src={member.avatarUrl} size={48} alt={member.display_name} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "1.05rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {member.display_name}
          </div>
          {labels.length > 0 && (
            <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.15rem" }}>
              {labels.map((label) => (
                <span key={label} style={{ fontSize: "0.75rem", opacity: 0.6 }}>{label}</span>
              ))}
            </div>
          )}
          {bio && (
            <div style={{ fontSize: "0.95rem", marginTop: "0.2rem", opacity: 0.8 }}>{bio}</div>
          )}
        </div>
      </div>
    </Link>
  );
}

function Home() {
  const { session } = useAuth();
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useSeo({ title: "LouLink | Louisville Link Repertoire" });

  useEffect(() => {
    fetch("/api/directory")
      .then((r) => r.json())
      .then((data) => { setMembers(data as DirectoryMember[]); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <>
      <div style={{ textAlign: "center", padding: "0.5rem 0 0" }}>
        <img
          src={logoFullColor}
          alt="LouLink"
          style={{ width: "min(55%, 220px)", height: "auto" }}
        />
      </div>
      <div style={{ display: "flex", gap: "0.25rem", marginTop: "2rem", marginBottom: "0.75rem" }}>
        {session ? (
          <ShapeButton to="/signup" shape={shape1} style={{ flex: 1 }}>Complete profile</ShapeButton>
        ) : (
          <>
            <ShapeButton to="/signin" shape={shape3} style={{ flex: 1 }}>Sign in</ShapeButton>
            <ShapeButton to="/signup" shape={shape1} style={{ flex: 1 }}>Sign up</ShapeButton>
          </>
        )}
        <ShapeButton to="/create" shape={shape4} style={{ flex: 1 }}>Create</ShapeButton>
      </div>
      <hr style={{ margin: "1.5rem 0", opacity: 0.2 }} />
      {status === "loading" && <p style={{ opacity: 0.5 }}>Loading members…</p>}
      {status === "error" && <p style={{ opacity: 0.5 }}>Could not load the directory.</p>}
      {status === "ready" && members.length === 0 && (
        <p style={{ opacity: 0.5 }}>No verified members yet.</p>
      )}
      {status === "ready" && members.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {members.map((m) => <MemberCard key={m.username} member={m} />)}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Create — link builder (no account required)
// ---------------------------------------------------------------------------

function CreatePage() {
  const navigate = useNavigate();
  const { session, profile, loadSession } = useAuth();
  useSeo({ title: profile ? "Edit Links | LouLink" : "Build Your Page | LouLink", noindex: true });
  // New users seed from localStorage draft; existing users load from the server below
  const [items, setItems] = useState<DraftItem[]>(() => getDraft().items ?? []);

  // Existing users: fetch their current links from the server and use those
  useEffect(() => {
    if (!profile) return;
    fetch(`/api/profile/${encodeURIComponent(profile.username)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.links) return;
        const loaded: DraftItem[] = (d.links as any[]).map((l) =>
          l.kind === "header"
            ? { kind: "header" as const, title: l.title }
            : { kind: "link" as const, title: l.title, url: l.url ?? "", icon: l.icon ?? undefined }
        );
        setItems(loaded);
      })
      .catch(() => {});
  }, [profile?.username]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [username, setUsername] = useState("");
  const checkStatus = useUsernameCheck(username);

  async function handleSave() {
    if (!session) return;
    setSaving(true);
    setSaveError("");

    // No profile yet — create it first via onboarding
    if (!profile) {
      if (!username) { setSaveError("Choose a username to save."); setSaving(false); return; }
      const onboardRes = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          username,
          display_name: session.name,
          links: items,
        }),
      });
      const d = await onboardRes.json();
      if (!onboardRes.ok) { setSaveError(d.error ?? "Failed to create profile."); setSaving(false); return; }
      clearDraft();
      await loadSession();
      navigate("/");
      return;
    }

    const res = await fetch("/api/me/links", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ links: items }),
    });
    if (!res.ok) {
      const d = await res.json();
      setSaveError(d.error ?? "Failed to save.");
      setSaving(false);
      return;
    }
    clearDraft();
    navigate("/");
  }
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkIcon, setLinkIcon] = useState<string>("");
  const [showNewForm, setShowNewForm] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragHandlePressed = useRef<number | null>(null);

  function updateItems(next: DraftItem[]) {
    setItems(next);
    saveDraft({ items: next });
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
    updateItems([...items, { kind: "link", title, url, icon: linkIcon || undefined }]);
    setLinkTitle("");
    setLinkUrl("");
    setLinkIcon("");
    setShowNewForm(false);
  }

  function addHeader() {
    updateItems([...items, { kind: "header", title: "New Section" }]);
  }

  function removeItem(i: number) {
    updateItems(items.filter((_, idx) => idx !== i));
  }

  function updateItem(i: number, patch: Partial<DraftItem>) {
    const next = items.map((item, idx) => {
      if (idx !== i) return item;
      const merged = { ...item, ...patch } as DraftItem;
      if (merged.kind === "header") {
        const { title } = merged;
        return { kind: "header", title } satisfies DraftHeader;
      }
      return merged;
    });
    updateItems(next);
  }

  function moveItem(from: number, to: number) {
    const next = [...items];
    next.splice(to, 0, next.splice(from, 1)[0]);
    updateItems(next);
  }

  function dragCardStyle(i: number) {
    const isOver = dragOverIndex === i && dragIndex !== null && dragIndex !== i;
    return {
      opacity: dragIndex === i ? 0.4 : 1,
      outline: isOver ? "2px solid #555" : "none",
      borderRadius: 4,
      transform: isOver ? `translateY(${dragIndex < i ? "-16px" : "16px"})` : "none",
      transition: "transform 150ms ease",
    };
  }

  return (
    <>
      <h1>{profile ? "Edit your links" : "Build your page"}</h1>
      {!profile && <p>Add your links below. You can create an account when you're ready to save.</p>}

      {items.map((item, i) => (
        <div
          key={i}
          draggable
          onDragStart={(e) => {
            if (dragHandlePressed.current !== i) { e.preventDefault(); return; }
            setDragIndex(i);
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
          onDrop={() => {
            if (dragIndex !== null && dragIndex !== i) moveItem(dragIndex, i);
            setDragIndex(null);
            setDragOverIndex(null);
          }}
          onDragEnd={() => { dragHandlePressed.current = null; setDragIndex(null); setDragOverIndex(null); }}
          style={{ ...dragCardStyle(i), position: "relative" }}
        >
          {/* Transparent overlay during drag captures events that child inputs would absorb */}
          {dragIndex !== null && dragIndex !== i && (
            <div style={{ position: "absolute", inset: 0, zIndex: 1 }} />
          )}
          <hr />
          {item.kind === "header" ? (
            <>
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "grab", userSelect: "none" }}
                onPointerDown={() => { dragHandlePressed.current = i; }}
                onPointerUp={() => { dragHandlePressed.current = null; }}
              >
                <GripVertical size={16} />
                <span style={{ fontWeight: "bold", textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.08em" }}>Section Header</span>
              </div>
              <p>
                <label>
                  Label<br />
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => updateItem(i, { title: e.target.value })}
                  />
                </label>
              </p>
              <p>
                <button type="button" onClick={() => removeItem(i)}>Remove</button>
              </p>
            </>
          ) : (
            <>
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "grab", userSelect: "none" }}
                onPointerDown={() => { dragHandlePressed.current = i; }}
                onPointerUp={() => { dragHandlePressed.current = null; }}
              >
                <GripVertical size={16} />
                <span style={{ fontWeight: "bold" }}>{item.title || "Untitled"}</span>
              </div>
              <p>
                <label>
                  Title<br />
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => updateItem(i, { title: e.target.value })}
                  />
                </label>
              </p>
              <p>
                <label>
                  URL<br />
                  <input
                    type="text"
                    value={item.url}
                    onChange={(e) => updateItem(i, { url: e.target.value })}
                  />
                </label>
              </p>
              <div>
                <label>
                  Icon<br />
                  <IconPicker value={item.icon ?? ""} onChange={(v) => updateItem(i, { icon: v || undefined })} />
                </label>
              </div>
              <p>
                <button type="button" onClick={() => removeItem(i)}>Remove</button>
              </p>
            </>
          )}
        </div>
      ))}

      <hr />

      {showNewForm ? (
        <>
          <p>
            <label>
              Title<br />
              <input
                type="text"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
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
              />
            </label>
          </p>
          <div>
            <label>
              Icon<br />
              <IconPicker value={linkIcon} onChange={setLinkIcon} />
            </label>
          </div>
          <p>
            <button
              type="button"
              onClick={addLink}
              disabled={!linkTitle.trim() || !linkUrl.trim()}
            >
              Add link
            </button>
            {!linkTitle.trim() && !linkUrl.trim() && items.length > 0 && (
              <> <button type="button" onClick={() => setShowNewForm(false)}>Cancel</button></>
            )}
          </p>
          <p>
            <button type="button" onClick={addHeader}>+ Add header</button>
          </p>
        </>
      ) : (
        <p style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" onClick={() => setShowNewForm(true)}>+ Add link</button>
          <button type="button" onClick={addHeader}>+ Add header</button>
        </p>
      )}

      {session ? (
        <>
          {!profile && (
            <p style={{ marginTop: "2rem" }}>
              <label>
                Username (loul.ink/…)<br />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
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
          )}
          {saveError && <p><strong>{saveError}</strong></p>}
          <p style={{ marginTop: profile ? "2rem" : undefined }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (!profile && checkStatus !== "available")}
            >
              {saving ? "Saving…" : "Save page →"}
            </button>
          </p>
        </>
      ) : (
        <>
          <p style={{ marginTop: "2rem" }}>
            <button type="button" onClick={() => navigate("/signup")}>
              Create account to save →
            </button>
          </p>
          <p>
            Already have an account? <Link to="/signin">Sign in</Link>
          </p>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Auth pages
// ---------------------------------------------------------------------------

function SignIn() {
  const { loadSession } = useAuth();
  const navigate = useNavigate();
  useSeo({ title: "Sign In | LouLink", noindex: true });
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
  const { session, loadSession } = useAuth();
  const navigate = useNavigate();
  useSeo({ title: "Sign Up | LouLink", noindex: true });
  const [displayName, setDisplayName] = useState(session?.name ?? "");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const checkStatus = useUsernameCheck(username);

  const hasSession = !!session;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const usernameValid = checkStatus === "available" && !validateUsername(username);
  const canSubmit =
    displayName.trim().length > 0 &&
    usernameValid &&
    (hasSession || (emailValid && password.length >= 8)) &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");

    let jwt: string | null = null;

    if (hasSession) {
      jwt = await getJwt();
      if (!jwt) {
        setError("Could not obtain auth token.");
        setSubmitting(false);
        return;
      }
    } else {
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

      jwt = await getJwt();
      if (!jwt) {
        setError("Could not obtain auth token after sign up.");
        setSubmitting(false);
        return;
      }
    }

    const draft = getDraft();
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        username,
        display_name: displayName.trim(),
        links: draft.items ?? [],
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
      <h1>{hasSession ? "Choose a username" : "Create your account"}</h1>
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
        {!hasSession && (
          <>
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
          </>
        )}
        {error && <p><strong>{error}</strong></p>}
        <p><button type="submit" disabled={!canSubmit}>{hasSession ? "Finish setup →" : "Create account"}</button></p>
      </form>
      <p>
        <Link to="/">Back</Link> &middot; <Link to="/signin">Sign in instead</Link>
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Avatar components
// ---------------------------------------------------------------------------

function AvatarImage({ src, size = 64, alt = "Profile picture" }: { src: string | null; size?: number; alt?: string }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block" }}
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
  );
}

const ALLOWED_IMAGE_TYPES_CLIENT = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_AVATAR_BYTES_CLIENT = 5 * 1024 * 1024;

function AvatarUpload({
  currentAvatarUrl,
  token,
  onSuccess,
}: {
  currentAvatarUrl: string | null;
  token: string;
  onSuccess: (newAvatarUrl: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(currentAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError("");
    if (!ALLOWED_IMAGE_TYPES_CLIENT.has(file.type)) {
      setError("Only JPEG, PNG, WebP, or GIF images are allowed.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES_CLIENT) {
      setError("Image must be under 5 MB.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setUploading(true);
    try {
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        headers: { "Content-Type": file.type, Authorization: `Bearer ${token}` },
        body: file,
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Upload failed.");
        setPreview(currentAvatarUrl);
        return;
      }
      onSuccess(d.avatarUrl);
    } catch {
      setError("Upload failed. Please try again.");
      setPreview(currentAvatarUrl);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  }

  return (
    <div>
      {preview && (
        <div style={{ marginBottom: 8 }}>
          <AvatarImage src={preview} size={80} alt="Profile picture preview" />
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      <p>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : preview ? "Change photo" : "Upload photo"}
        </button>
      </p>
      {error && <p><strong>{error}</strong></p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [dirStatus, setDirStatus] = useState<"loading" | "ready" | "error">("loading");
  useSeo({ title: "Dashboard | LouLink", noindex: true });

  useEffect(() => {
    fetch("/api/directory")
      .then((r) => r.json())
      .then((data) => { setMembers(data as DirectoryMember[]); setDirStatus("ready"); })
      .catch(() => setDirStatus("error"));
  }, []);

  if (!profile) return null;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <AvatarImage src={profile.avatarUrl} size={56} alt={profile.display_name} />
        <h1 style={{ margin: 0 }}>Welcome, {profile.display_name}</h1>
      </div>
      <p>
        Your profile:{" "}
        <a href={`https://loul.ink/${profile.username}`} target="_blank" rel="noreferrer">
          loul.ink/{profile.username}
        </a>
      </p>
      <p>
        <Link to="/create">Edit links</Link>
        {" · "}
        <Link to="/settings">Settings</Link>
        {" · "}
        <button onClick={async () => { await signOut(); navigate("/"); }}>
          Sign out
        </button>
      </p>
      <hr style={{ margin: "1.5rem 0", opacity: 0.2 }} />
      {dirStatus === "loading" && <p style={{ opacity: 0.5 }}>Loading members…</p>}
      {dirStatus === "error" && <p style={{ opacity: 0.5 }}>Could not load the directory.</p>}
      {dirStatus === "ready" && members.length === 0 && (
        <p style={{ opacity: 0.5 }}>No verified members yet.</p>
      )}
      {dirStatus === "ready" && members.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {members.map((m) => <MemberCard key={m.username} member={m} />)}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function Settings() {
  const { session, profile, loadSession } = useAuth();
  useSeo({ title: "Settings | LouLink", noindex: true });
  const [username, setUsername] = useState(profile?.username ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatarUrl ?? null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState<string[]>(profile?.categories ?? []);
  const [categoryError, setCategoryError] = useState("");
  const [categorySuccess, setCategorySuccess] = useState(false);
  const [categorySubmitting, setCategorySubmitting] = useState(false);

  function toggleCategory(value: string) {
    setCategories((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
    );
  }

  async function handleCategorySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setCategorySubmitting(true);
    setCategoryError("");
    setCategorySuccess(false);
    const res = await fetch("/api/me/categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ categories }),
    });
    const d = await res.json();
    if (!res.ok) { setCategoryError(d.error ?? "Failed to update."); setCategorySubmitting(false); return; }
    setCategorySuccess(true);
    setCategorySubmitting(false);
    await loadSession();
  }

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
      <h2>Profile picture</h2>
      {session && (
        <AvatarUpload
          currentAvatarUrl={avatarUrl}
          token={session.token}
          onSuccess={(url) => setAvatarUrl(url)}
        />
      )}
      <h2>Categories</h2>
      <form onSubmit={handleCategorySubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", margin: "0.5rem 0 1rem" }}>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={categories.includes(value)}
                onChange={() => toggleCategory(value)}
              />
              {label}
            </label>
          ))}
        </div>
        {categoryError && <p><strong>{categoryError}</strong></p>}
        {categorySuccess && <p>Categories updated!</p>}
        <p><button type="submit" disabled={categorySubmitting}>Save categories</button></p>
      </form>
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
// Public profile page
// ---------------------------------------------------------------------------

function useOgImages(urls: string[]) {
  const [images, setImages] = useState<Record<string, string>>({});
  const key = urls.join("\n");
  useEffect(() => {
    if (urls.length === 0) return;
    for (const url of urls) {
      fetch(`/api/og?url=${encodeURIComponent(url)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { ogImage: string | null } | null) => {
          if (d?.ogImage) setImages((prev) => ({ ...prev, [url]: d.ogImage! }));
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return images;
}

type PublicItem =
  | { kind: "link"; title: string; url: string; icon?: string }
  | { kind: "header"; title: string };
type PublicProfile = {
  username: string;
  display_name: string;
  bio: string | null;
  categories: string[];
  verified: boolean;
  avatarUrl: string | null;
};

// moved — see definition before Home()

function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [items, setItems] = useState<PublicItem[]>([]);
  const [status, setStatus] = useState<"loading" | "found" | "not-found">("loading");
  useSeo({
    title: profile ? `${profile.display_name} | LouLink` : "LouLink | Louisville Link Repertoire",
  });

  useEffect(() => {
    if (!username) { setStatus("not-found"); return; }
    fetch(`/api/profile/${encodeURIComponent(username)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.profile) { setStatus("not-found"); return; }
        setProfile(d.profile);
        setItems((d.links ?? []).map((l: any) => l.kind === "header"
          ? { kind: "header", title: l.title }
          : { kind: "link", title: l.title, url: l.url, icon: l.icon ?? undefined }
        ));
        setStatus("found");
      })
      .catch(() => setStatus("not-found"));
  }, [username]);

  const linkUrls = items
    .filter((it): it is Extract<PublicItem, { kind: "link" }> => it.kind === "link")
    .map((it) => it.url);
  const ogImages = useOgImages(linkUrls);

  // Accent color: first brand icon's color, fallback neutral
  const accentColor = (() => {
    for (const item of items) {
      if (item.kind === "link" && item.icon && BRAND_COLORS[item.icon]) {
        return BRAND_COLORS[item.icon];
      }
    }
    return "#6b7280";
  })();

  if (status === "loading") return <p>Loading…</p>;
  if (status === "not-found" || !profile) {
    return (
      <>
        <h1>Page not found</h1>
        <p>No profile exists at this URL.</p>
        <p><Link to="/">Go home</Link></p>
      </>
    );
  }

  const linkItems = items.filter((it) => it.kind === "link");

  return (
    <div style={{ paddingBottom: "4rem" }}>
      {/* Profile header */}
      <div style={{ textAlign: "center", padding: "2rem 0 1.75rem" }}>
        {profile.avatarUrl && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.75rem" }}>
            <AvatarImage src={profile.avatarUrl} size={80} alt={profile.display_name} />
          </div>
        )}
        <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.01em" }}>
          {profile.display_name}
          {profile.verified && (
            <span style={{ color: accentColor, fontSize: "1rem", marginLeft: 6 }} title="Verified Louisville">✓</span>
          )}
        </h1>
        {profile.bio && (
          <p style={{ color: "#555", margin: "0.5rem 0 0", fontSize: "0.95rem", lineHeight: 1.5 }}>
            {profile.bio}
          </p>
        )}
        {profile.categories.length > 0 && (
          <p style={{ margin: "0.5rem 0 0", display: "flex", justifyContent: "center", gap: "0.4rem", flexWrap: "wrap" }}>
            {profile.categories.map((cat) => (
              <span key={cat} style={{
                display: "inline-block",
                fontSize: "0.75rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: accentColor,
                background: `${accentColor}18`,
                borderRadius: 20,
                padding: "3px 10px",
              }}>
                {CATEGORY_LABELS[cat] ?? cat}
              </span>
            ))}
          </p>
        )}
      </div>

      {/* Items */}
      {linkItems.length === 0 ? (
        <p style={{ textAlign: "center", color: "#9ca3af" }}>No links yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {items.map((item, i) => {
            if (item.kind === "header") {
              return (
                <div key={i} style={{ textAlign: "center", padding: "0.75rem 0 0.25rem" }}>
                  <span style={{
                    fontWeight: 700,
                    fontSize: "0.7rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "#9ca3af",
                  }}>
                    {item.title}
                  </span>
                </div>
              );
            }
            const iconColor = item.icon ? BRAND_COLORS[item.icon] : undefined;
            const ogImage = ogImages[item.url];
            return (
              <a
                key={i}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="link-card"
                style={{ "--accent": accentColor } as React.CSSProperties & { "--accent": string }}
              >
                {item.icon && <Icon name={item.icon} size={20} color={iconColor} />}
                <span style={{ flex: 1 }}>{item.title}</span>
                {ogImage && (
                  <img
                    src={ogImage}
                    alt=""
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      objectFit: "cover",
                      flexShrink: 0,
                      opacity: 0.92,
                    }}
                  />
                )}
              </a>
            );
          })}
        </div>
      )}

      {/* LouLink attribution */}
      <div style={{ textAlign: "right", marginTop: "2.5rem" }}>
        <Link
          to="/"
          style={{
            fontSize: "0.75rem",
            color: accentColor,
            textDecoration: "none",
            fontFamily: "Georgia, serif",
            letterSpacing: "0.03em",
            opacity: 0.7,
          }}
        >
          loul.ink
        </Link>
      </div>
    </div>
  );
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
          <Route path="/create" element={<CreatePage />} />
          <Route path="/settings" element={<RequireProfile><Settings /></RequireProfile>} />
          <Route path="/:username" element={<ProfilePage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
