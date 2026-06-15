// ---------------------------------------------------------------------------
// Public profile page
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getCached, setCached, deleteCached } from "../lib/cache";
import { useSeo } from "../lib/seo";
import { Icon, BRAND_COLORS } from "../components/icons";
import { AvatarImage } from "../components/Avatar";
import { CATEGORY_LABELS, THEMES, THEME_NAMES, HEADER_COLOR_PRESETS, parseAccentColor, type ProfileTheme } from "../types";
import { useAuth } from "../auth";

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
  social_links: Record<string, string>;
  accent_color: string | null;
};

function toPastel(hex: string, mix = 0.22): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * mix + 255 * (1 - mix))}, ${Math.round(g * mix + 255 * (1 - mix))}, ${Math.round(b * mix + 255 * (1 - mix))})`;
}

function getFaviconUrl(url: string): string {
  try {
    const { hostname } = new URL(url);
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
  } catch {
    return "";
  }
}

function resolveTheme(accentColor: string | null | undefined, items: PublicItem[]): ProfileTheme {
  if (accentColor && THEMES[accentColor]) return THEMES[accentColor];
  if (accentColor && accentColor.startsWith("#")) {
    return { bg: toPastel(accentColor), card: "#ffffff", text: "#111111", label: accentColor };
  }
  const iconColor = (() => {
    for (const item of items) {
      if (item.kind === "link" && item.icon && BRAND_COLORS[item.icon]) return BRAND_COLORS[item.icon];
    }
    return "#6b7280";
  })();
  return { bg: "#fdf8f2", card: "#ffffff", text: "#111111", label: iconColor };
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { session, profile: authProfile } = useAuth();
  const cacheKey = `/api/profile/${username}`;
  const cachedProfile = getCached<{ profile: PublicProfile; links: any[] }>(cacheKey);
  const [profile, setProfile] = useState<PublicProfile | null>(cachedProfile?.profile ?? null);
  const [items, setItems] = useState<PublicItem[]>(() =>
    cachedProfile ? (cachedProfile.links ?? []).map((l: any) => l.kind === "header"
      ? { kind: "header" as const, title: l.title }
      : { kind: "link" as const, title: l.title, url: l.url, icon: l.icon ?? undefined }
    ) : []
  );
  const [status, setStatus] = useState<"loading" | "found" | "not-found">(cachedProfile ? "found" : "loading");
  const [ogImages, setOgImages] = useState<Record<string, string>>({});

  // Pending theme key for owner preview before saving
  const themeInitialized = useRef(false);
  const { themeKey: cachedTheme, headerColor: cachedHeader, monoSocial: cachedMono } = parseAccentColor(cachedProfile?.profile?.accent_color ?? null);
  const [pendingKey, setPendingKey] = useState<string | null>(cachedTheme);
  const [pendingHeader, setPendingHeader] = useState<string | null>(cachedHeader);
  const [pendingMono, setPendingMono] = useState<boolean>(cachedMono);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeSaved, setThemeSaved] = useState(false);

  useSeo({
    title: profile ? `${profile.display_name} | LouLink` : "LouLink | Louisville Link Repertoire",
  });

  useEffect(() => {
    if (!username) { setStatus("not-found"); return; }
    if (cachedProfile) return;
    fetch(`/api/profile/${encodeURIComponent(username)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.profile) { setStatus("not-found"); return; }
        setCached(cacheKey, d);
        setProfile(d.profile);
        setItems((d.links ?? []).map((l: any) => l.kind === "header"
          ? { kind: "header", title: l.title }
          : { kind: "link", title: l.title, url: l.url, icon: l.icon ?? undefined }
        ));
        setStatus("found");
        if (!themeInitialized.current) {
          themeInitialized.current = true;
          const { themeKey, headerColor, monoSocial } = parseAccentColor(d.profile.accent_color ?? null);
          setPendingKey(themeKey);
          setPendingHeader(headerColor);
          setPendingMono(monoSocial);
        }
      })
      .catch(() => setStatus("not-found"));
  }, [username]);

  // Sync pendingKey once when cached profile is used
  useEffect(() => {
    if (profile && !themeInitialized.current) {
      themeInitialized.current = true;
      const { themeKey, headerColor, monoSocial } = parseAccentColor(profile.accent_color ?? null);
      setPendingKey(themeKey);
      setPendingHeader(headerColor);
      setPendingMono(monoSocial);
    }
  }, [profile]);

  useEffect(() => {
    const linkUrls = items
      .filter((it): it is Extract<PublicItem, { kind: "link" }> => it.kind === "link")
      .map((it) => it.url);
    if (linkUrls.length === 0) return;
    Promise.all(
      linkUrls.map((url) =>
        fetch(`/api/og?url=${encodeURIComponent(url)}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d: { ogImage: string | null } | null) => ({ url, ogImage: d?.ogImage ?? null }))
          .catch(() => ({ url, ogImage: null }))
      )
    ).then((results) => {
      const map: Record<string, string> = {};
      for (const { url, ogImage } of results) {
        if (ogImage) map[url] = ogImage;
      }
      setOgImages(map);
    });
  }, [items]);

  const isOwner = !!authProfile && authProfile.username === username;
  const theme = resolveTheme(pendingKey, items);
  const { themeKey: savedKey, headerColor: savedHeader, monoSocial: savedMono } = parseAccentColor(profile?.accent_color ?? null);
  const isDirty = pendingKey !== savedKey || pendingHeader !== savedHeader || pendingMono !== savedMono;

  useEffect(() => {
    if (!profile) return;
    const prevBody = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = theme.bg;
    document.documentElement.style.background = theme.bg;
    return () => {
      document.body.style.background = prevBody;
      document.documentElement.style.background = prevHtml;
    };
  }, [theme.bg, profile]);

  async function handleSaveTheme() {
    if (!session || !profile || themeSaving) return;
    setThemeSaving(true);
    const res = await fetch("/api/me/accent", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ accent_color: pendingKey, header_color: pendingHeader, mono_social: pendingMono }),
    });
    setThemeSaving(false);
    if (res.ok) {
      const d = await res.json();
      setProfile((p) => p ? { ...p, accent_color: d.profile.accent_color } : p);
      deleteCached(cacheKey);
      setThemeSaved(true);
      setTimeout(() => setThemeSaved(false), 2000);
    }
  }

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
    <div style={{ paddingBottom: isOwner ? "8rem" : "4rem", color: theme.text, "--accent": theme.label } as React.CSSProperties & { "--accent": string }}>
      {/* Profile header */}
      <div style={{ textAlign: "center", padding: "2rem 0 1.75rem" }}>
        {profile.avatarUrl && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.75rem" }}>
            <AvatarImage src={profile.avatarUrl} size={80} alt={profile.display_name} />
          </div>
        )}
        <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.01em", color: theme.text }}>
          {profile.display_name}
          {profile.verified && (
            <span style={{ color: theme.label, fontSize: "1rem", marginLeft: 6 }} title="Verified Louisville">✓</span>
          )}
        </h1>
        {profile.bio && (
          <p style={{ color: theme.text, opacity: 0.65, margin: "0.5rem 0 0", fontSize: "0.95rem", lineHeight: 1.5 }}>
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
                color: theme.label,
                background: `${theme.label}22`,
                borderRadius: 20,
                padding: "3px 10px",
              }}>
                {CATEGORY_LABELS[cat] ?? cat}
              </span>
            ))}
          </p>
        )}
        {Object.keys(profile.social_links ?? {}).length > 0 && (
          <div style={{ display: "flex", justifyContent: "center", gap: "0.6rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
            {Object.entries(profile.social_links).map(([platform, url]) => {
              if (!url || !BRAND_COLORS[platform]) return null;
              const color = pendingMono ? theme.text : BRAND_COLORS[platform];
              return (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={platform}
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 40, height: 40, borderRadius: "50%",
                    background: `${color}18`, border: `1.5px solid ${color}`,
                    color, textDecoration: "none", flexShrink: 0,
                    transition: "background 150ms ease",
                  }}
                >
                  <Icon name={platform} size={18} color={color} />
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Items */}
      {linkItems.length === 0 ? (
        <p style={{ textAlign: "center", opacity: 0.5 }}>No links yet.</p>
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
                    color: pendingHeader ?? theme.text,
                    opacity: pendingHeader ? 1 : 0.4,
                  }}>
                    {item.title}
                  </span>
                </div>
              );
            }
            const iconColor = item.icon ? BRAND_COLORS[item.icon] : undefined;
            const ogImage = ogImages[item.url];
            const faviconUrl = !ogImage ? getFaviconUrl(item.url) : "";
            return (
              <a
                key={i}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="link-card"
                style={{ background: theme.card, color: theme.text, borderColor: `${theme.label}28` }}
              >
                {ogImage && (
                  <img
                    src={ogImage}
                    alt=""
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                    style={{
                      alignSelf: "stretch",
                      marginLeft: "calc(-1rem + 0.65rem)",
                      width: 110,
                      flexShrink: 0,
                      borderRadius: "10px",
                      objectFit: "cover",
                    }}
                  />
                )}
                {item.icon && <Icon name={item.icon} size={20} color={iconColor} />}
                <span style={{ flex: 1 }}>{item.title}</span>
                {faviconUrl && (
                  <img
                    src={faviconUrl}
                    alt=""
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                    style={{ width: 20, height: 20, flexShrink: 0, opacity: 0.6 }}
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
            color: theme.label,
            textDecoration: "none",
            fontFamily: "Georgia, serif",
            letterSpacing: "0.03em",
            opacity: 0.7,
          }}
        >
          loul.ink
        </Link>
      </div>

      {/* Owner theme toolbar */}
      {isOwner && (
        <div style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 600,
          background: `${theme.card}f0`,
          backdropFilter: "blur(12px)",
          borderTop: `1px solid ${theme.label}30`,
          padding: "0.6rem 1rem",
          display: "flex", flexDirection: "column", gap: "0.5rem",
          zIndex: 100,
          boxSizing: "border-box",
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.text, opacity: 0.5, flexShrink: 0 }}>Theme</span>

          {/* Auto */}
          <button
            type="button"
            title="Auto"
            onClick={() => { setPendingKey(null); setThemeSaved(false); }}
            style={{
              width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg, #f78f1e 0%, #56b0e3 50%, #9b59b6 100%)",
              border: "none", cursor: "pointer", padding: 0,
              outline: pendingKey === null ? `2.5px solid ${theme.text}` : "2.5px solid transparent",
              outlineOffset: 2, transition: "outline-color 150ms",
            }}
          />

          {/* Presets */}
          {Object.entries(THEMES).map(([key, t]) => (
            <button
              key={key}
              type="button"
              title={THEME_NAMES[key]}
              onClick={() => { setPendingKey(key); setThemeSaved(false); }}
              style={{
                width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                background: t.bg,
                border: "none", cursor: "pointer", padding: 0,
                outline: pendingKey === key ? `2.5px solid ${theme.text}` : "2.5px solid transparent",
                outlineOffset: 2, transition: "outline-color 150ms",
              }}
            />
          ))}

          {/* Custom color picker */}
          <label title="Custom color" style={{ position: "relative", width: 26, height: 26, flexShrink: 0, cursor: "pointer" }}>
            <span style={{
              display: "block", width: 26, height: 26, borderRadius: "50%",
              background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
              outline: (pendingKey !== null && !THEMES[pendingKey]) ? `2.5px solid ${theme.text}` : "2.5px solid transparent",
              outlineOffset: 2, transition: "outline-color 150ms",
            }} />
            <input
              type="color"
              value={(pendingKey !== null && !THEMES[pendingKey]) ? pendingKey : "#ee3666"}
              onChange={(e) => { setPendingKey(e.target.value); setThemeSaved(false); }}
              style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer" }}
            />
          </label>

          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.text, opacity: 0.5, flexShrink: 0 }}>Headers</span>
            {HEADER_COLOR_PRESETS.map(({ name, color }) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => { setPendingHeader(color); setThemeSaved(false); }}
                style={{
                  width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                  background: color === null ? `linear-gradient(135deg, ${theme.text}66, ${theme.text}22)` : theme.card,
                  border: color === null ? `2px dashed ${theme.text}44` : `1.5px solid ${theme.text}18`,
                  cursor: "pointer", padding: 0,
                  outline: pendingHeader === color ? `2.5px solid ${theme.text}` : "2.5px solid transparent",
                  outlineOffset: 2, transition: "outline-color 150ms",
                  color: color ?? "transparent",
                  fontSize: "1.1rem", fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {color !== null && "A"}
              </button>
            ))}
            <label title="Custom header color" style={{ position: "relative", width: 26, height: 26, flexShrink: 0, cursor: "pointer" }}>
              <span style={{
                display: "block", width: 26, height: 26, borderRadius: "50%",
                background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                outline: (pendingHeader !== null && !HEADER_COLOR_PRESETS.some((p) => p.color === pendingHeader)) ? `2.5px solid ${theme.text}` : "2.5px solid transparent",
                outlineOffset: 2, transition: "outline-color 150ms",
              }} />
              <input
                type="color"
                value={(pendingHeader !== null && !HEADER_COLOR_PRESETS.some((p) => p.color === pendingHeader)) ? pendingHeader : "#888888"}
                onChange={(e) => { setPendingHeader(e.target.value); setThemeSaved(false); }}
                style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer" }}
              />
            </label>
          </div>

          {/* Social color toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!pendingMono}
              onChange={(e) => { setPendingMono(!e.target.checked); setThemeSaved(false); }}
              style={{ width: 16, height: 16, cursor: "pointer", accentColor: theme.label }}
            />
            <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.text, opacity: 0.5 }}>
              Social colors
            </span>
          </label>

          {(isDirty || themeSaved) && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {themeSaved && (
                <span style={{ fontSize: "0.75rem", color: theme.label, fontWeight: 600 }}>Saved!</span>
              )}
              {isDirty && !themeSaved && (
                <button
                  type="button"
                  onClick={handleSaveTheme}
                  disabled={themeSaving}
                  style={{
                    background: theme.label, color: theme.card,
                    border: "none", borderRadius: 20, padding: "0.3rem 0.9rem",
                    fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
                    opacity: themeSaving ? 0.6 : 1,
                  }}
                >
                  {themeSaving ? "…" : "Save"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
