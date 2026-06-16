// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useAuth } from "../auth";
import { deleteCached } from "../lib/cache";
import { useSeo } from "../lib/seo";
import { validateUsername, useUsernameCheck } from "../lib/username";
import { PageHeader, ShapeTitle, BlobButton, AVATAR_BLOB_SHAPES } from "../components/ui";
import { AvatarImage } from "../components/Avatar";
import { CATEGORY_HIERARCHY, THEMES, THEME_NAMES, HEADER_COLOR_PRESETS, AVATAR_SHAPES, parseAccentColor, type ProfileTheme, type AvatarShape } from "../types";

const GROUP_COLORS: Record<string, string> = {
  artists: "#ee3666", businesses: "#f78f1e", media: "#56b0e3",
  venues: "#a78bfa", community: "#d88cbb",
};


function resolvePreviewTheme(accentColor: string | null): ProfileTheme {
  if (accentColor && THEMES[accentColor]) return THEMES[accentColor];
  if (accentColor && accentColor.startsWith("#")) {
    const r = parseInt(accentColor.slice(1, 3), 16);
    const g = parseInt(accentColor.slice(3, 5), 16);
    const b = parseInt(accentColor.slice(5, 7), 16);
    const mix = 0.22;
    const bg = `rgb(${Math.round(r * mix + 255 * (1 - mix))},${Math.round(g * mix + 255 * (1 - mix))},${Math.round(b * mix + 255 * (1 - mix))})`;
    return { bg, card: "#ffffff", text: "#111111", label: accentColor };
  }
  return { bg: "#fdf8f2", card: "#ffffff", text: "#111111", label: "#6b7280" };
}

export default function Settings() {
  const { session, profile, loadSession } = useAuth();
  useSeo({ title: "Settings | LouLink", noindex: true });
  const [username, setUsername] = useState(profile?.username ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatarUrl ?? null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [bioError, setBioError] = useState("");
  const [bioSuccess, setBioSuccess] = useState(false);
  const [bioSubmitting, setBioSubmitting] = useState(false);
  const [categories, setCategories] = useState<string[]>(profile?.categories ?? []);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState("");
  const [categorySuccess, setCategorySuccess] = useState(false);
  const [categorySubmitting, setCategorySubmitting] = useState(false);

  const { themeKey: initTheme, headerColor: initHeader, monoSocial: initMono, avatarShape: initShape } = parseAccentColor(profile?.accent_color ?? null);
  const [accentColor, setAccentColor] = useState<string | null>(initTheme);
  const [headerColor, setHeaderColor] = useState<string | null>(initHeader);
  const [monoSocial, setMonoSocial] = useState<boolean>(initMono);
  const [avatarShape, setAvatarShape] = useState<AvatarShape>(initShape);
  const [appearanceError, setAppearanceError] = useState("");
  const [appearanceSuccess, setAppearanceSuccess] = useState(false);
  const [appearanceSubmitting, setAppearanceSubmitting] = useState(false);

  const previewTheme = resolvePreviewTheme(accentColor);
  const isCustomAccent = accentColor !== null && !THEMES[accentColor];
  const isCustomHeader = headerColor !== null && !HEADER_COLOR_PRESETS.some((p) => p.color === headerColor);

  async function handleBioSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBioSubmitting(true);
    setBioError("");
    setBioSuccess(false);
    const res = await fetch("/api/me/bio", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ bio }),
    });
    const d = await res.json();
    if (!res.ok) { setBioError(d.error ?? "Failed to update."); setBioSubmitting(false); return; }
    setBioSuccess(true);
    setBioSubmitting(false);
    deleteCached(`/api/profile/${profile?.username}`);
    deleteCached("/api/directory");
    await loadSession();
  }

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
    deleteCached(`/api/profile/${profile?.username}`);
    deleteCached("/api/directory");
    await loadSession();
  }

  async function handleAppearanceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setAppearanceSubmitting(true);
    setAppearanceError("");
    setAppearanceSuccess(false);
    const res = await fetch("/api/me/accent", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ accent_color: accentColor, header_color: headerColor, mono_social: monoSocial, avatar_shape: avatarShape }),
    });
    const d = await res.json();
    if (!res.ok) { setAppearanceError(d.error ?? "Failed to update."); setAppearanceSubmitting(false); return; }
    setAppearanceSuccess(true);
    setAppearanceSubmitting(false);
    deleteCached(`/api/profile/${profile?.username}`);
    await loadSession();
  }

  const changed = username !== profile?.username;
  const validationError = changed && username ? validateUsername(username) : null;
  const checkStatus = useUsernameCheck(changed ? username : "");
  const canSubmit = changed && !validationError && checkStatus === "available" && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !session) return;
    setSubmitting(true);
    setError("");
    setSuccess(false);
    const res = await fetch("/api/me/username", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ username }),
    });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Something went wrong."); setSubmitting(false); return; }
    setSuccess(true);
    setSubmitting(false);
    deleteCached(`/api/profile/${profile?.username}`);
    deleteCached(`/api/profile/${username}`);
    deleteCached("/api/directory");
    await loadSession();
  }

  if (!profile) return null;

  const labelStyle: React.CSSProperties = {
    fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.08em", color: "#888", marginBottom: "0.5rem", display: "block",
  };

  return (
    <>
      <PageHeader />
      <ShapeTitle>Settings</ShapeTitle>

      {/* Profile picture */}
      <div className="settings-card">
        <h2 style={{ textAlign: "center" }}>Profile picture</h2>
        {session && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.5rem" }}>
            <AvatarImage src={avatarUrl} size={80} alt="Profile picture" shape={avatarShape} />
          </div>
        )}
        {session && (
          <div style={{ marginTop: "0.75rem" }}>
            <input
              type="file"
              id="avatar-upload"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const res = await fetch("/api/me/avatar", {
                  method: "POST",
                  headers: { "Content-Type": file.type, Authorization: `Bearer ${session.token}` },
                  body: file,
                });
                const d = await res.json();
                if (res.ok) { setAvatarUrl(d.avatarUrl); deleteCached(`/api/profile/${profile.username}`); }
                e.target.value = "";
              }}
            />
            <p style={{ textAlign: "center" }}>
              <BlobButton type="button" blob="D" from="#56b0e3" to="#a78bfa" onClick={() => document.getElementById("avatar-upload")?.click()}>
                {avatarUrl ? "Change photo" : "Upload photo"}
              </BlobButton>
            </p>
          </div>
        )}
      </div>

      {/* Unified appearance */}
      <div className="settings-card">
        <h2 style={{ textAlign: "center" }}>Profile appearance</h2>
        <form onSubmit={handleAppearanceSubmit}>

          {/* Live preview */}
          <div style={{
            borderRadius: 14, overflow: "hidden", border: "1px solid #e5e7eb",
            marginBottom: "1.75rem", background: previewTheme.bg,
            transition: "background 200ms",
          }}>
            <div style={{ padding: "1.25rem 1rem", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.5rem" }}>
                {avatarUrl
                  ? <AvatarImage src={avatarUrl} size={56} shape={avatarShape} />
                  : <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${previewTheme.label}33` }} />
                }
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: previewTheme.text, marginBottom: "0.75rem" }}>
                {profile.display_name}
              </div>
              <div style={{
                fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em",
                color: headerColor ?? previewTheme.text, opacity: headerColor ? 1 : 0.4,
                marginBottom: "0.5rem",
              }}>
                Section header
              </div>
              {["Sample link", "Another link"].map((text) => (
                <div key={text} style={{
                  background: previewTheme.card, borderRadius: 10, padding: "0.45rem 0.75rem",
                  border: `1px solid ${previewTheme.label}28`, marginBottom: "0.35rem",
                  fontSize: "0.8rem", fontWeight: 600, color: previewTheme.text, textAlign: "left",
                }}>{text}</div>
              ))}
            </div>
          </div>

          {/* Theme */}
          <span style={labelStyle}>Theme</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", marginBottom: "1.25rem" }}>
            {/* Auto */}
            <button type="button" onClick={() => setAccentColor(null)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <span style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 56, height: 44, borderRadius: 8,
                background: "#fdf8f2", border: `2px solid ${accentColor === null ? "#333" : "#d1d5db"}`,
                boxShadow: accentColor === null ? "0 0 0 3px #33333330" : "none",
                fontSize: "0.6rem", fontWeight: 700, color: "#888", letterSpacing: "0.08em", textTransform: "uppercase",
                transition: "border-color 150ms, box-shadow 150ms",
              }}>Auto</span>
              <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "#666" }}>Auto</span>
            </button>
            {/* Presets */}
            {Object.entries(THEME_NAMES).map(([key, name]) => {
              const t = THEMES[key];
              const selected = accentColor === key;
              return (
                <button key={key} type="button" onClick={() => { setAccentColor(key); setHeaderColor(t.label); }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <span style={{
                    display: "block", width: 56, height: 44, borderRadius: 8,
                    background: t.bg, border: `2px solid ${selected ? t.label : "#d1d5db"}`,
                    boxShadow: selected ? `0 0 0 3px ${t.label}33` : "none",
                    transition: "border-color 150ms, box-shadow 150ms",
                  }} />
                  <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "#666" }}>{name}</span>
                </button>
              );
            })}
            {/* Custom */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem" }}>
              <label title="Custom color" style={{ position: "relative", width: 56, height: 44, cursor: "pointer", display: "block" }}>
                <span style={{
                  display: "block", width: 56, height: 44, borderRadius: 8,
                  background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                  border: `2px solid ${isCustomAccent ? "#333" : "#d1d5db"}`,
                  boxShadow: isCustomAccent ? "0 0 0 3px #33333330" : "none",
                  overflow: "hidden", position: "relative",
                  transition: "border-color 150ms, box-shadow 150ms",
                }}>
                  <input type="color"
                    value={isCustomAccent ? (accentColor ?? "#ee3666") : "#ee3666"}
                    onChange={(e) => setAccentColor(e.target.value)}
                    style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer" }}
                  />
                </span>
              </label>
              <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "#666" }}>Custom</span>
            </div>
          </div>

          {/* Header color */}
          <span style={labelStyle}>Section header color</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "1.25rem" }}>
            {HEADER_COLOR_PRESETS.map(({ name, color }) => {
              const selected = headerColor === color;
              return (
                <button key={name} type="button" title={name} onClick={() => setHeaderColor(color)}
                  style={{
                    width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                    background: color === null ? "linear-gradient(135deg, #aaa 0%, #ddd 100%)" : "#fff",
                    border: color === null ? "2px dashed #bbb" : `1.5px solid #e5e7eb`,
                    outline: selected ? "2.5px solid #333" : "2.5px solid transparent",
                    outlineOffset: 2, cursor: "pointer", padding: 0,
                    color: color ?? "transparent", fontSize: "1rem", fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "outline-color 150ms",
                  }}
                >
                  {color !== null && "A"}
                </button>
              );
            })}
            <label title="Custom header color" style={{ position: "relative", width: 34, height: 34, flexShrink: 0, cursor: "pointer" }}>
              <span style={{
                display: "block", width: 34, height: 34, borderRadius: "50%",
                background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                outline: isCustomHeader ? "2.5px solid #333" : "2.5px solid transparent",
                outlineOffset: 2, transition: "outline-color 150ms",
              }} />
              <input type="color"
                value={isCustomHeader ? (headerColor ?? "#888888") : "#888888"}
                onChange={(e) => setHeaderColor(e.target.value)}
                style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer" }}
              />
            </label>
          </div>

          {/* Avatar shape */}
          <span style={labelStyle}>Avatar shape</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "1.25rem" }}>
            {AVATAR_SHAPES.map((s) => (
              <button key={s} type="button" title={s === "circle" ? "Circle" : `Shape ${s}`}
                onClick={() => setAvatarShape(s)}
                style={{
                  width: 44, height: 44, flexShrink: 0, background: "none", border: "none",
                  cursor: "pointer", padding: 4,
                  outline: avatarShape === s ? "2.5px solid #333" : "2.5px solid transparent",
                  outlineOffset: 2, borderRadius: 6, transition: "outline-color 150ms",
                }}
              >
                {s === "circle"
                  ? <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#33333333" }} />
                  : <svg viewBox={AVATAR_BLOB_SHAPES[s].viewBox} style={{ width: 36, height: 36, display: "block" }}>
                      <path d={AVATAR_BLOB_SHAPES[s].d} fill="#33333333" />
                    </svg>
                }
              </button>
            ))}
          </div>

          {/* Social colors toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", marginBottom: "1.5rem" }}>
            <input
              type="checkbox"
              checked={!monoSocial}
              onChange={(e) => setMonoSocial(!e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#555" }}>Show social media brand colors</span>
          </label>

          {appearanceError && <p style={{ textAlign: "center" }}><strong>{appearanceError}</strong></p>}
          {appearanceSuccess && <p style={{ textAlign: "center" }}>Appearance saved!</p>}
          <p style={{ textAlign: "center", marginBottom: 0 }}>
            <BlobButton blob="E" disabled={appearanceSubmitting} from="#f78f1e" to="#ee3666">Save appearance</BlobButton>
          </p>
        </form>
      </div>

      {/* Bio */}
      <div className="settings-card">
        <h2 style={{ textAlign: "center" }}>Bio</h2>
        <form onSubmit={handleBioSubmit}>
          <label>
            <span className="settings-label">About you (max 300 characters)</span>
            <textarea
              value={bio}
              onChange={(e) => { setBio(e.target.value.slice(0, 300)); setBioSuccess(false); }}
              rows={4}
              maxLength={300}
              style={{ resize: "vertical" }}
            />
          </label>
          <div style={{ fontSize: "0.85rem", color: "#888", textAlign: "right", marginTop: "0.25rem" }}>{bio.length}/300</div>
          {bioError && <p style={{ textAlign: "center" }}><strong>{bioError}</strong></p>}
          {bioSuccess && <p style={{ textAlign: "center" }}>Bio updated!</p>}
          <p style={{ textAlign: "center", marginBottom: 0 }}>
            <BlobButton blob="F" disabled={bioSubmitting} from="#d88cbb" to="#56b0e3">Save bio</BlobButton>
          </p>
        </form>
      </div>

      {/* Categories */}
      <div className="settings-card">
        <h2 style={{ textAlign: "center" }}>Categories</h2>
        <form onSubmit={handleCategorySubmit}>
          {/* Parent group buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", justifyContent: "center", padding: "0.75rem 0 0.5rem" }}>
            {CATEGORY_HIERARCHY.map((group, gi) => {
              const isOpen = openGroup === group.key;
              const selCount = group.subs.filter((s) => categories.includes(s.key)).length;
              const color = GROUP_COLORS[group.key] ?? "#888";
              const rotations = ["-2deg", "1.5deg", "-1.2deg", "2deg", "-1.8deg"];
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : group.key)}
                  style={{
                    padding: "0.45rem 1.2rem", borderRadius: 100,
                    border: `2px solid ${color}`,
                    background: isOpen || selCount > 0 ? color : "transparent",
                    color: isOpen || selCount > 0 ? "#fff" : color,
                    fontWeight: 700, fontSize: "1rem", letterSpacing: "0.07em", textTransform: "uppercase",
                    fontFamily: "'Aladin', Georgia, serif", cursor: "pointer",
                    transition: "background 150ms ease, color 150ms ease",
                    transform: `rotate(${rotations[gi % rotations.length]})`,
                    position: "relative",
                  }}
                >
                  {group.label}
                  {selCount > 0 && !isOpen && (
                    <span style={{
                      position: "absolute", top: "-7px", right: "-7px",
                      width: "18px", height: "18px", borderRadius: "50%",
                      background: "#fff", color, border: `1.5px solid ${color}`,
                      fontSize: "0.65rem", fontWeight: 800, fontFamily: "system-ui, sans-serif",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{selCount}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Subcategory pills for the open group */}
          {openGroup && (() => {
            const group = CATEGORY_HIERARCHY.find((g) => g.key === openGroup)!;
            const color = GROUP_COLORS[openGroup] ?? "#888";
            const rotations = ["-2deg", "1.5deg", "-1.2deg", "2deg", "-1.8deg", "1deg", "-0.8deg", "2.2deg", "-1.5deg"];
            return (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.85rem", justifyContent: "center", padding: "1.5rem 0 1.25rem" }}>
                {group.subs.map((sub, i) => {
                  const selected = categories.includes(sub.key);
                  return (
                    <label key={sub.key} style={{
                      display: "inline-flex", alignItems: "center", cursor: "pointer",
                      padding: "0.42rem 1.05rem", borderRadius: 100,
                      border: `2px solid ${color}`,
                      background: selected ? color : "transparent",
                      color: selected ? "#fff" : color,
                      fontWeight: 700, fontSize: "0.92rem", letterSpacing: "0.06em", textTransform: "uppercase",
                      transform: `rotate(${rotations[i % rotations.length]})`,
                      transition: "background 150ms ease, color 150ms ease",
                      userSelect: "none", fontFamily: "'Aladin', Georgia, serif",
                    }}>
                      <input type="checkbox" checked={selected} onChange={() => toggleCategory(sub.key)} style={{ display: "none" }} />
                      {sub.label}
                    </label>
                  );
                })}
              </div>
            );
          })()}

          {categoryError && <p style={{ textAlign: "center" }}><strong>{categoryError}</strong></p>}
          {categorySuccess && <p style={{ textAlign: "center" }}>Categories updated!</p>}
          <p style={{ textAlign: "center", marginBottom: 0 }}>
            <BlobButton blob="G" disabled={categorySubmitting} from="#56b0e3" to="#d88cbb">Save categories</BlobButton>
          </p>
        </form>
      </div>

      {/* Username */}
      <div className="settings-card">
        <h2 style={{ textAlign: "center" }}>Change username</h2>
        <p style={{ textAlign: "center", marginTop: 0 }}>Current: <strong>{profile.username}</strong></p>
        <form onSubmit={handleSubmit}>
          <label>
            <span className="settings-label">New username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
              required
            />
          </label>
          {changed && username && (
            <div style={{ fontSize: "0.85rem", marginTop: "0.35rem", textAlign: "center" }}>
              {checkStatus === "checking" && "Checking…"}
              {checkStatus === "available" && "✓ Available"}
              {checkStatus === "taken" && "✗ Taken"}
              {checkStatus === "invalid" && (validationError ?? "Invalid")}
            </div>
          )}
          {error && <p style={{ textAlign: "center" }}><strong>{error}</strong></p>}
          {success && <p style={{ textAlign: "center" }}>Username updated to <strong>{username}</strong>!</p>}
          <p style={{ textAlign: "center", marginBottom: 0 }}>
            <BlobButton blob="B" disabled={!canSubmit} from="#ee3666" to="#a78bfa">Update username</BlobButton>
          </p>
        </form>
      </div>
    </>
  );
}
