// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useAuth } from "../auth";
import { deleteCached } from "../lib/cache";
import { useSeo } from "../lib/seo";
import { validateUsername, useUsernameCheck } from "../lib/username";
import { PageHeader, ShapeTitle, BlobButton } from "../components/ui";
import { AvatarUpload } from "../components/Avatar";
import { CATEGORY_LABELS, THEMES, THEME_NAMES, HEADER_COLOR_PRESETS, parseAccentColor } from "../types";

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
  const [categoryError, setCategoryError] = useState("");
  const [categorySuccess, setCategorySuccess] = useState(false);
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const { themeKey: initTheme, headerColor: initHeader } = parseAccentColor(profile?.accent_color ?? null);
  const [accentColor, setAccentColor] = useState<string | null>(initTheme);
  const [colorError, setColorError] = useState("");
  const [colorSuccess, setColorSuccess] = useState(false);
  const [colorSubmitting, setColorSubmitting] = useState(false);
  const [headerColor, setHeaderColor] = useState<string | null>(initHeader);
  const [headerColorError, setHeaderColorError] = useState("");
  const [headerColorSuccess, setHeaderColorSuccess] = useState(false);
  const [headerColorSubmitting, setHeaderColorSubmitting] = useState(false);

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

  const isCustom = accentColor !== null && !THEMES[accentColor];

  async function handleColorSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setColorSubmitting(true);
    setColorError("");
    setColorSuccess(false);
    const res = await fetch("/api/me/accent", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ accent_color: accentColor, header_color: headerColor }),
    });
    const d = await res.json();
    if (!res.ok) { setColorError(d.error ?? "Failed to update."); setColorSubmitting(false); return; }
    setColorSuccess(true);
    setColorSubmitting(false);
    deleteCached(`/api/profile/${profile?.username}`);
    await loadSession();
  }

  const isCustomHeader = headerColor !== null && !HEADER_COLOR_PRESETS.some((p) => p.color === headerColor);

  async function handleHeaderColorSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setHeaderColorSubmitting(true);
    setHeaderColorError("");
    setHeaderColorSuccess(false);
    const res = await fetch("/api/me/accent", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ accent_color: accentColor, header_color: headerColor }),
    });
    const d = await res.json();
    if (!res.ok) { setHeaderColorError(d.error ?? "Failed to update."); setHeaderColorSubmitting(false); return; }
    setHeaderColorSuccess(true);
    setHeaderColorSubmitting(false);
    deleteCached(`/api/profile/${profile?.username}`);
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
    deleteCached(`/api/profile/${profile?.username}`);
    deleteCached(`/api/profile/${username}`);
    deleteCached("/api/directory");
    await loadSession();
  }

  if (!profile) return null;

  return (
    <>
      <PageHeader />
      <ShapeTitle>Settings</ShapeTitle>
      <div className="settings-card">
        <h2 style={{ textAlign: "center" }}>Profile picture</h2>
        {session && (
          <AvatarUpload
            currentAvatarUrl={avatarUrl}
            token={session.token}
            onSuccess={(url) => { setAvatarUrl(url); deleteCached(`/api/profile/${profile.username}`); }}
          />
        )}
      </div>
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
            <BlobButton disabled={bioSubmitting} from="#56b0e3" to="#d88cbb">Save bio</BlobButton>
          </p>
        </form>
      </div>
      <div className="settings-card">
        <h2 style={{ textAlign: "center" }}>Profile theme</h2>
        <form onSubmit={handleColorSubmit}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center", padding: "0.75rem 0 1.25rem" }}>
            {/* Auto option */}
            {(() => {
              const selected = accentColor === null;
              return (
                <button key="auto" type="button" onClick={() => { setAccentColor(null); setColorSuccess(false); }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <span style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 72, height: 56, borderRadius: 10,
                    background: "#fdf8f2", border: `2px solid ${selected ? "#333" : "#d1d5db"}`,
                    boxShadow: selected ? "0 0 0 3px #33333340" : "none",
                    transition: "border-color 150ms, box-shadow 150ms",
                    fontSize: "0.65rem", fontWeight: 700, color: "#888", letterSpacing: "0.08em", textTransform: "uppercase",
                  }}>Auto</span>
                  <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#555" }}>Auto</span>
                </button>
              );
            })()}
            {/* Preset themes */}
            {Object.entries(THEME_NAMES).map(([key, name]) => {
              const t = THEMES[key];
              const selected = accentColor === key;
              return (
                <button key={key} type="button" onClick={() => { setAccentColor(key); setColorSuccess(false); }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <span style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                    width: 72, height: 56, borderRadius: 10,
                    background: t.bg, border: `2px solid ${selected ? t.label : "#d1d5db"}`,
                    boxShadow: selected ? `0 0 0 3px ${t.label}40` : "none",
                    transition: "border-color 150ms, box-shadow 150ms",
                  }}>
                    <span style={{ background: t.card, borderRadius: 5, padding: "3px 10px", fontSize: "0.6rem", fontWeight: 700, color: t.text, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>Card</span>
                    <span style={{ fontSize: "0.6rem", fontWeight: 700, color: t.label }}>Label</span>
                  </span>
                  <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#555" }}>{name}</span>
                </button>
              );
            })}
            {/* Custom color picker */}
            <button type="button" onClick={() => { if (!isCustom) { setAccentColor("#ee3666"); } setColorSuccess(false); }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem", background: "none", border: "none", cursor: "pointer", padding: 0, position: "relative" }}>
              <span style={{
                display: "block", width: 72, height: 56, borderRadius: 10,
                background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                border: `2px solid ${isCustom ? "#333" : "#d1d5db"}`,
                boxShadow: isCustom ? "0 0 0 3px #33333340" : "none",
                overflow: "hidden", position: "relative",
                transition: "border-color 150ms, box-shadow 150ms",
              }}>
                <input
                  type="color"
                  value={isCustom ? (accentColor ?? "#ee3666") : "#ee3666"}
                  onChange={(e) => { setAccentColor(e.target.value); setColorSuccess(false); }}
                  style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer" }}
                />
              </span>
              <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#555" }}>Custom</span>
            </button>
          </div>
          {isCustom && accentColor && (
            <p style={{ textAlign: "center", fontSize: "0.85rem", color: "#555", marginTop: 0 }}>
              Selected: <span style={{ fontWeight: 700, color: accentColor }}>{accentColor}</span>
            </p>
          )}
          {colorError && <p style={{ textAlign: "center" }}><strong>{colorError}</strong></p>}
          {colorSuccess && <p style={{ textAlign: "center" }}>Theme updated!</p>}
          <p style={{ textAlign: "center", marginBottom: 0 }}>
            <BlobButton disabled={colorSubmitting}>Save theme</BlobButton>
          </p>
        </form>
      </div>
      <div className="settings-card">
        <h2 style={{ textAlign: "center" }}>Header color</h2>
        <form onSubmit={handleHeaderColorSubmit}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center", padding: "0.75rem 0 1.25rem" }}>
            {HEADER_COLOR_PRESETS.map(({ name, color }) => {
              const selected = headerColor === color;
              return (
                <button key={name} type="button" onClick={() => { setHeaderColor(color); setHeaderColorSuccess(false); }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <span style={{
                    display: "block", width: 40, height: 40, borderRadius: "50%",
                    background: color ?? "linear-gradient(135deg, #aaa 0%, #ddd 100%)",
                    border: color === null ? "2px dashed #bbb" : "2px solid transparent",
                    outline: selected ? "2.5px solid #333" : "2.5px solid transparent",
                    outlineOffset: 2,
                    boxShadow: selected ? "0 0 0 4px #33333320" : "0 0 0 1px #e5e7eb",
                    transition: "outline-color 150ms, box-shadow 150ms",
                  }} />
                  <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#555" }}>{name}</span>
                </button>
              );
            })}
            <button type="button" onClick={() => { if (!isCustomHeader) setHeaderColor("#888888"); setHeaderColorSuccess(false); }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem", background: "none", border: "none", cursor: "pointer", padding: 0, position: "relative" }}>
              <span style={{
                display: "block", width: 40, height: 40, borderRadius: "50%",
                background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                outline: isCustomHeader ? "2.5px solid #333" : "2.5px solid transparent",
                outlineOffset: 2,
                boxShadow: isCustomHeader ? "0 0 0 4px #33333320" : "0 0 0 1px #e5e7eb",
                overflow: "hidden", position: "relative",
                transition: "outline-color 150ms, box-shadow 150ms",
              }}>
                <input
                  type="color"
                  value={isCustomHeader ? (headerColor ?? "#888888") : "#888888"}
                  onChange={(e) => { setHeaderColor(e.target.value); setHeaderColorSuccess(false); }}
                  style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer" }}
                />
              </span>
              <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#555" }}>Custom</span>
            </button>
          </div>
          {isCustomHeader && headerColor && (
            <p style={{ textAlign: "center", fontSize: "0.85rem", color: "#555", marginTop: 0 }}>
              Selected: <span style={{ fontWeight: 700, color: headerColor }}>{headerColor}</span>
            </p>
          )}
          {headerColorError && <p style={{ textAlign: "center" }}><strong>{headerColorError}</strong></p>}
          {headerColorSuccess && <p style={{ textAlign: "center" }}>Header color updated!</p>}
          <p style={{ textAlign: "center", marginBottom: 0 }}>
            <BlobButton blob="B" disabled={headerColorSubmitting}>Save header color</BlobButton>
          </p>
        </form>
      </div>
      <div className="settings-card">
        <h2 style={{ textAlign: "center" }}>Categories</h2>
        <form onSubmit={handleCategorySubmit}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", justifyContent: "center", padding: "0.75rem 0 1.25rem" }}>
            {Object.entries(CATEGORY_LABELS).map(([value, label], i) => {
              const colors = ["#f78f1e", "#d88cbb", "#ee3666", "#56b0e3", "#d88cbb"];
              const rotations = ["-2deg", "1.5deg", "-1.2deg", "2deg", "-1.8deg"];
              const paddings = ["0.45rem 1.2rem", "0.5rem 1rem", "0.4rem 1.3rem", "0.5rem 1.1rem", "0.45rem 0.95rem"];
              const selected = categories.includes(value);
              const color = colors[i];
              return (
                <label key={value} style={{
                  display: "inline-flex",
                  alignItems: "center",
                  cursor: "pointer",
                  padding: paddings[i],
                  borderRadius: 100,
                  border: `2px solid ${color}`,
                  background: selected ? color : "transparent",
                  color: selected ? "#fff" : color,
                  fontWeight: 700,
                  fontSize: "1rem",
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  transform: `rotate(${rotations[i]})`,
                  transition: "background 150ms ease, color 150ms ease",
                  userSelect: "none",
                  fontFamily: "'Aladin', Georgia, serif",
                }}>
                  <input type="checkbox" checked={selected} onChange={() => toggleCategory(value)} style={{ display: "none" }} />
                  {label}
                </label>
              );
            })}
          </div>
          {categoryError && <p style={{ textAlign: "center" }}><strong>{categoryError}</strong></p>}
          {categorySuccess && <p style={{ textAlign: "center" }}>Categories updated!</p>}
          <p style={{ textAlign: "center", marginBottom: 0 }}>
            <BlobButton blob="B" disabled={categorySubmitting}>Save categories</BlobButton>
          </p>
        </form>
      </div>
      <div className="settings-card">
        <h2 style={{ textAlign: "center" }}>Change username</h2>
        <p style={{ textAlign: "center", marginTop: 0 }}>Current: <strong>{profile.username}</strong></p>
        <form onSubmit={handleSubmit}>
          <label>
            <span className="settings-label">New username</span>
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
            <BlobButton blob="C" reversed disabled={!canSubmit}>Update username</BlobButton>
          </p>
        </form>
      </div>
    </>
  );
}
