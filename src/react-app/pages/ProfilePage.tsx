// ---------------------------------------------------------------------------
// Public profile page
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Settings, BarChart2, Pencil } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { getCached, setCached, deleteCached } from "../lib/cache";
import { useSeo } from "../lib/seo";
import { autoTextColor, generateCardPalette } from "../lib/color";
import { Icon, BRAND_COLORS } from "../components/icons";
import { AvatarImage } from "../components/Avatar";
import { CATEGORY_LABELS, THEMES, THEME_NAMES, HEADER_COLOR_PRESETS, AVATAR_SHAPES, parseAccentColor, type ProfileTheme, type AvatarShape } from "../types";
import { AVATAR_BLOB_SHAPES } from "../components/ui";
import { useAuth } from "../auth";

type PublicItem =
  | { kind: "link"; id?: string; title: string; url: string; icon?: string }
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

function getFaviconUrl(url: string): string {
  try {
    const { hostname } = new URL(url);
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
  } catch {
    return "";
  }
}

function resolveTheme(parsed: ReturnType<typeof parseAccentColor>, items: PublicItem[]): ProfileTheme {
  const { themeKey, cardColor, cardTextColor } = parsed;
  let base: ProfileTheme;
  if (themeKey && THEMES[themeKey]) {
    base = THEMES[themeKey];
  } else if (themeKey && themeKey.startsWith("#")) {
    const bgText = autoTextColor(themeKey);
    base = { bg: themeKey, card: "#ffffff", text: bgText, cardText: "#111111", label: bgText };
  } else {
    const iconColor = (() => {
      for (const item of items) {
        if (item.kind === "link" && item.icon && BRAND_COLORS[item.icon]) return BRAND_COLORS[item.icon];
      }
      return "#6b7280";
    })();
    base = { bg: "#fdf8f2", card: "#ffffff", text: "#111111", cardText: "#111111", label: iconColor };
  }
  const card = cardColor ?? base.card;
  const cardText = cardTextColor ?? autoTextColor(card);
  return { ...base, card, cardText };
}

function bgForKey(key: string | null): string {
  if (key && THEMES[key]) return THEMES[key].bg;
  if (key && /^#[0-9a-fA-F]{6}$/.test(key)) return key;
  return "#fdf8f2";
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
      : { kind: "link" as const, id: l.id, title: l.title, url: l.url, icon: l.icon ?? undefined }
    ) : []
  );
  const [status, setStatus] = useState<"loading" | "found" | "not-found">(cachedProfile ? "found" : "loading");
  const [ogImages, setOgImages] = useState<Record<string, string | null>>({});

  // Pending theme key for owner preview before saving
  const themeInitialized = useRef(false);
  const { themeKey: cachedTheme, headerColor: cachedHeader, monoSocial: cachedMono, avatarShape: cachedShape, cardColor: cachedCard, cardTextColor: cachedCardText } = parseAccentColor(cachedProfile?.profile?.accent_color ?? null);
  const [pendingKey, setPendingKey] = useState<string | null>(cachedTheme);
  const [pendingHeader, setPendingHeader] = useState<string | null>(cachedHeader);
  const [pendingMono, setPendingMono] = useState<boolean>(cachedMono);
  const [pendingShape, setPendingShape] = useState<AvatarShape>(cachedShape);
  const [pendingCardColor, setPendingCardColor] = useState<string | null>(cachedCard);
  const [pendingCardText, setPendingCardText] = useState<string | null>(cachedCardText);
  const [cardTextOpen, setCardTextOpen] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeSaved, setThemeSaved] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

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
          : { kind: "link", id: l.id, title: l.title, url: l.url, icon: l.icon ?? undefined }
        ));
        setStatus("found");
        if (!themeInitialized.current) {
          themeInitialized.current = true;
          const { themeKey, headerColor, monoSocial, avatarShape, cardColor, cardTextColor } = parseAccentColor(d.profile.accent_color ?? null);
          setPendingKey(themeKey);
          setPendingHeader(headerColor);
          setPendingMono(monoSocial);
          setPendingShape(avatarShape);
          setPendingCardColor(cardColor);
          setPendingCardText(cardTextColor);
        }
      })
      .catch(() => setStatus("not-found"));
  }, [username]);

  // Sync pendingKey once when cached profile is used
  useEffect(() => {
    if (profile && !themeInitialized.current) {
      themeInitialized.current = true;
      const { themeKey, headerColor, monoSocial, avatarShape, cardColor, cardTextColor } = parseAccentColor(profile.accent_color ?? null);
      setPendingKey(themeKey);
      setPendingHeader(headerColor);
      setPendingMono(monoSocial);
      setPendingShape(avatarShape);
      setPendingCardColor(cardColor);
      setPendingCardText(cardTextColor);
    }
  }, [profile]);

  useEffect(() => {
    const linkUrls = items
      .filter((it): it is Extract<PublicItem, { kind: "link" }> => it.kind === "link")
      .map((it) => it.url);
    if (linkUrls.length === 0) return;
    for (const url of linkUrls) {
      fetch(`/api/og?url=${encodeURIComponent(url)}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d: { ogImage: string | null } | null) => {
          setOgImages((prev) => ({ ...prev, [url]: d?.ogImage ?? null }));
        })
        .catch(() => {
          setOgImages((prev) => ({ ...prev, [url]: null }));
        });
    }
  }, [items]);

  const isOwner = !!authProfile && authProfile.username === username;

  // ---- Analytics tracking ----
  const eventIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== "found" || !profile || isOwner) return;
    const body = JSON.stringify({ username: profile.username, referrer: document.referrer || null });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.token) headers["Authorization"] = `Bearer ${session.token}`;
    fetch("/api/track/view", { method: "POST", headers, body })
      .then((r) => r.json())
      .then((d: { ok: boolean; eventId?: string }) => {
        if (d.ok && d.eventId) {
          eventIdRef.current = d.eventId;
          startTimeRef.current = Date.now();
        }
      })
      .catch(() => {});
    return () => {
      const eventId = eventIdRef.current;
      const start = startTimeRef.current;
      if (!eventId || !start) return;
      const durationMs = Date.now() - start;
      if (durationMs < 500) return;
      navigator.sendBeacon(
        "/api/track/duration",
        new Blob([JSON.stringify({ eventId, durationMs })], { type: "application/json" }),
      );
    };
  }, [status, profile?.username, isOwner]);
  const theme = resolveTheme({ themeKey: pendingKey, headerColor: pendingHeader, monoSocial: pendingMono, avatarShape: pendingShape, cardColor: pendingCardColor, cardTextColor: pendingCardText }, items);
  const { themeKey: savedKey, headerColor: savedHeader, monoSocial: savedMono, avatarShape: savedShape, cardColor: savedCardColor, cardTextColor: savedCardTextColor } = parseAccentColor(profile?.accent_color ?? null);
  const isDirty = pendingKey !== savedKey || pendingHeader !== savedHeader || pendingMono !== savedMono || pendingShape !== savedShape || pendingCardColor !== savedCardColor || pendingCardText !== savedCardTextColor;

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
      body: JSON.stringify({ accent_color: pendingKey, header_color: pendingHeader, mono_social: pendingMono, avatar_shape: pendingShape, card_color: pendingCardColor, card_text_color: pendingCardText }),
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

  function handleLinkClick(linkId: string | undefined) {
    if (isOwner || !linkId) return;
    const body = JSON.stringify({ linkId, referrer: document.referrer || null });
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track/click", blob);
    } else {
      fetch("/api/track/click", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
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
            <div style={{ position: "relative", display: "inline-block" }}>
              <AvatarImage src={profile.avatarUrl} size={80} alt={profile.display_name} shape={pendingShape} />
              {profile.verified && (
                <span title="Verified Louisville" style={{
                  position: "absolute", bottom: 2, right: 2,
                  width: 20, height: 20, borderRadius: "50%",
                  background: theme.label, color: theme.card,
                  fontSize: "0.65rem", fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 0 0 2px ${theme.bg}`,
                }}>✓</span>
              )}
            </div>
          </div>
        )}
        <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.01em", color: theme.text }}>
          {profile.display_name}
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
            const ogStatus = ogImages[item.url];
            const isOgLoading = !(item.url in ogImages);
            const faviconUrl = !ogStatus && !isOgLoading ? getFaviconUrl(item.url) : "";
            return (
              <a
                key={i}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="link-card"
                style={{ background: theme.card, color: theme.cardText, borderColor: `${theme.label}28` }}
                onClick={() => handleLinkClick(item.id)}
              >
                {(isOgLoading || ogStatus) && (
                  <div
                    style={{
                      width: 110,
                      height: 72,
                      alignSelf: "stretch",
                      flexShrink: 0,
                      marginLeft: "calc(-1rem + 0.65rem)",
                      borderRadius: "10px",
                      overflow: "hidden",
                    }}
                  >
                    {ogStatus && (
                      <img
                        src={ogStatus}
                        alt=""
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    )}
                  </div>
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

      {/* Owner bookmark tabs — analytics + theme palette */}
      {isOwner && !paletteOpen && (
        <>
          <Link
            to="/create"
            title="Edit links"
            style={{
              position: "fixed", bottom: 0, right: 96,
              width: 44, height: 36,
              background: `${theme.card}f0`, backdropFilter: "blur(12px)",
              border: `1px solid ${theme.label}30`, borderBottom: "none",
              borderRadius: "8px 8px 0 0",
              color: theme.text,
              textDecoration: "none",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 100, boxShadow: "0 -2px 8px #0002",
            }}
          ><Pencil size={16} /></Link>
          <Link
            to="/analytics"
            title="View analytics"
            style={{
              position: "fixed", bottom: 0, right: 48,
              width: 44, height: 36,
              background: `${theme.card}f0`, backdropFilter: "blur(12px)",
              border: `1px solid ${theme.label}30`, borderBottom: "none",
              borderRadius: "8px 8px 0 0",
              color: theme.text,
              textDecoration: "none",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 100, boxShadow: "0 -2px 8px #0002",
            }}
          ><BarChart2 size={16} /></Link>
          <button
            type="button"
            title="Open theme palette"
            onClick={() => setPaletteOpen(true)}
            style={{
              position: "fixed", bottom: 0, right: 0,
              width: 44, height: 36,
              background: `${theme.card}f0`, backdropFilter: "blur(12px)",
              border: `1px solid ${theme.label}30`, borderBottom: "none",
              borderRadius: "8px 8px 0 0",
              color: theme.cardText, fontSize: "0.85rem",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 100, boxShadow: "0 -2px 8px #0002",
            }}
          ><Settings size={16} /></button>
        </>
      )}

      {/* Owner theme toolbar */}
      {isOwner && paletteOpen && (
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
          {/* Close button */}
          <button
            type="button"
            title="Close palette"
            onClick={() => setPaletteOpen(false)}
            style={{
              position: "absolute", top: 6, right: 8,
              background: "none", border: "none", cursor: "pointer",
              color: theme.cardText, opacity: 0.4, fontSize: "1rem", lineHeight: 1,
              padding: "2px 4px",
            }}
          >✕</button>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.cardText, opacity: 0.5, flexShrink: 0 }}>Theme</span>

          {/* Auto */}
          <button
            type="button"
            title="Auto"
            onClick={() => { setPendingKey(null); setPendingHeader(null); setPendingCardColor(null); setPendingCardText(null); setThemeSaved(false); }}
            style={{
              width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
              background: "none", border: `2px dashed ${theme.cardText}55`,
              cursor: "pointer", padding: 0,
              outline: pendingKey === null ? `2.5px solid ${theme.cardText}` : "2.5px solid transparent",
              outlineOffset: 2, transition: "outline-color 150ms",
            }}
          />

          {/* Presets */}
          {Object.entries(THEMES).map(([key, t]) => (
            <button
              key={key}
              type="button"
              title={THEME_NAMES[key]}
              onClick={() => {
                const idx = pendingCardColor !== null ? generateCardPalette(theme.bg).indexOf(pendingCardColor) : -1;
                const oldTextSwatches = [null, theme.text, theme.label, pendingHeader].filter((c, i, a) => a.indexOf(c) === i);
                const textIdx = oldTextSwatches.indexOf(pendingCardText);
                const newTextSwatches = [null, t.text, t.label, t.label].filter((c, i, a) => a.indexOf(c) === i);
                setPendingKey(key);
                setPendingHeader(t.label);
                if (idx !== -1) setPendingCardColor(generateCardPalette(THEMES[key].bg)[idx]);
                if (textIdx !== -1) setPendingCardText(newTextSwatches[Math.min(textIdx, newTextSwatches.length - 1)]);
                setThemeSaved(false);
              }}
              style={{
                width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                background: t.bg,
                border: "none", cursor: "pointer", padding: 0,
                outline: pendingKey === key ? `2.5px solid ${theme.cardText}` : "2.5px solid transparent",
                outlineOffset: 2, transition: "outline-color 150ms",
              }}
            />
          ))}

          {/* Custom color picker */}
          <label title="Custom color" style={{ position: "relative", width: 26, height: 26, flexShrink: 0, cursor: "pointer" }}>
            <span style={{
              display: "block", width: 26, height: 26, borderRadius: "50%",
              background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
              outline: (pendingKey !== null && !THEMES[pendingKey]) ? `2.5px solid ${theme.cardText}` : "2.5px solid transparent",
              outlineOffset: 2, transition: "outline-color 150ms",
            }} />
            <input
              type="color"
              value={(pendingKey !== null && !THEMES[pendingKey]) ? pendingKey : "#ee3666"}
              onChange={(e) => {
                const newKey = e.target.value;
                const idx = pendingCardColor !== null ? generateCardPalette(theme.bg).indexOf(pendingCardColor) : -1;
                const oldTextSwatches = [null, theme.text, theme.label, pendingHeader].filter((c, i, a) => a.indexOf(c) === i);
                const textIdx = oldTextSwatches.indexOf(pendingCardText);
                const derivedText = autoTextColor(newKey);
                const newTextSwatches = [null, derivedText, pendingHeader].filter((c, i, a) => a.indexOf(c) === i);
                setPendingKey(newKey);
                if (idx !== -1) setPendingCardColor(generateCardPalette(bgForKey(newKey))[idx]);
                if (textIdx !== -1) setPendingCardText(newTextSwatches[Math.min(textIdx, newTextSwatches.length - 1)]);
                setThemeSaved(false);
              }}
              style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer" }}
            />
          </label>

          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.cardText, opacity: 0.5, flexShrink: 0 }}>Headers</span>
            {HEADER_COLOR_PRESETS.map(({ name, color }) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => { setPendingHeader(color); setThemeSaved(false); }}
                style={{
                  width: color === null ? 26 : 34, height: color === null ? 26 : 34, borderRadius: "50%", flexShrink: 0,
                  background: color === null ? "none" : theme.card,
                  border: color === null ? `2px dashed ${theme.cardText}55` : `1.5px solid ${theme.cardText}18`,
                  cursor: "pointer", padding: 0,
                  outline: pendingHeader === color ? `2.5px solid ${theme.cardText}` : "2.5px solid transparent",
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
                outline: (pendingHeader !== null && !HEADER_COLOR_PRESETS.some((p) => p.color === pendingHeader)) ? `2.5px solid ${theme.cardText}` : "2.5px solid transparent",
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

          {/* Card color picker */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.cardText, opacity: 0.5, flexShrink: 0 }}>Cards</span>
            {/* Auto */}
            <button
              type="button"
              title="Auto"
              onClick={() => { setPendingCardColor(null); setPendingCardText(null); setThemeSaved(false); }}
              style={{
                width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                background: "none", border: `2px dashed ${theme.cardText}55`,
                cursor: "pointer", padding: 0,
                outline: pendingCardColor === null ? `2.5px solid ${theme.cardText}` : "2.5px solid transparent",
                outlineOffset: 2, transition: "outline-color 150ms",
              }}
            />
            {/* Presets derived from current bg */}
            {generateCardPalette(theme.bg).map((hex) => (
              <button
                key={hex}
                type="button"
                title={hex}
                onClick={() => { setPendingCardColor(hex); setPendingCardText(null); setThemeSaved(false); }}
                style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  background: hex, border: `1.5px solid ${theme.cardText}20`,
                  cursor: "pointer", padding: 0,
                  outline: pendingCardColor === hex ? `2.5px solid ${theme.cardText}` : "2.5px solid transparent",
                  outlineOffset: 2, transition: "outline-color 150ms",
                }}
              />
            ))}
            {/* Custom picker */}
            <label title="Custom card color" style={{ position: "relative", width: 26, height: 26, flexShrink: 0, cursor: "pointer" }}>
              <span style={{
                display: "block", width: 26, height: 26, borderRadius: "50%",
                background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                outline: (pendingCardColor !== null && !generateCardPalette(theme.bg).includes(pendingCardColor)) ? `2.5px solid ${theme.cardText}` : "2.5px solid transparent",
                outlineOffset: 2, transition: "outline-color 150ms",
              }} />
              <input
                type="color"
                value={pendingCardColor ?? "#ffffff"}
                onChange={(e) => { setPendingCardColor(e.target.value); setPendingCardText(null); setThemeSaved(false); }}
                style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer" }}
              />
            </label>
            {/* Card text toggle */}
            <button
              type="button"
              title="Card text color"
              onClick={() => setCardTextOpen((o) => !o)}
              style={{
                marginLeft: "auto", flexShrink: 0,
                background: "none", border: `1.5px solid ${theme.cardText}30`,
                borderRadius: 6, padding: "2px 6px",
                fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em",
                color: pendingCardText ? theme.cardText : `${theme.cardText}55`,
                cursor: "pointer", transition: "color 150ms",
              }}
            >Aa {cardTextOpen ? "▲" : "▼"}</button>
          </div>

          {/* Card text color row */}
          {cardTextOpen && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", paddingLeft: "2.5rem" }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.cardText, opacity: 0.4, flexShrink: 0 }}>Text</span>
              {/* Auto */}
              <button
                type="button"
                title="Auto"
                onClick={() => { setPendingCardText(null); setThemeSaved(false); }}
                style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  background: "none", border: `2px dashed ${theme.cardText}55`,
                  cursor: "pointer", padding: 0,
                  outline: pendingCardText === null ? `2.5px solid ${theme.cardText}` : "2.5px solid transparent",
                  outlineOffset: 2, transition: "outline-color 150ms",
                }}
              />
              {/* Contextual swatches: page text, accent/label, header color */}
              {[theme.text, theme.label, ...(pendingHeader ? [pendingHeader] : [])].filter((c, i, a) => a.indexOf(c) === i).map((hex) => (
                <button
                  key={hex}
                  type="button"
                  title={hex}
                  onClick={() => { setPendingCardText(hex); setThemeSaved(false); }}
                  style={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                    background: hex, border: `1.5px solid ${theme.cardText}20`,
                    cursor: "pointer", padding: 0,
                    outline: pendingCardText === hex ? `2.5px solid ${theme.cardText}` : "2.5px solid transparent",
                    outlineOffset: 2, transition: "outline-color 150ms",
                  }}
                />
              ))}
              {/* Custom text color picker */}
              <label title="Custom card text color" style={{ position: "relative", width: 22, height: 22, flexShrink: 0, cursor: "pointer" }}>
                <span style={{
                  display: "block", width: 22, height: 22, borderRadius: "50%",
                  background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                  outline: (pendingCardText !== null && ![theme.text, theme.label, pendingHeader].includes(pendingCardText)) ? `2.5px solid ${theme.cardText}` : "2.5px solid transparent",
                  outlineOffset: 2, transition: "outline-color 150ms",
                }} />
                <input
                  type="color"
                  value={pendingCardText ?? theme.cardText}
                  onChange={(e) => { setPendingCardText(e.target.value); setThemeSaved(false); }}
                  style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer" }}
                />
              </label>
            </div>
          )}

          {/* Avatar shape picker */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.cardText, opacity: 0.5, flexShrink: 0 }}>Shape</span>
            {AVATAR_SHAPES.map((s) => (
              <button
                key={s}
                type="button"
                title={s === "circle" ? "Circle" : `Blob ${s}`}
                onClick={() => { setPendingShape(s); setThemeSaved(false); }}
                style={{
                  width: 34, height: 34, flexShrink: 0, background: "none", border: "none",
                  cursor: "pointer", padding: 2,
                  outline: pendingShape === s ? `2.5px solid ${theme.cardText}` : "2.5px solid transparent",
                  outlineOffset: 2, borderRadius: 4, transition: "outline-color 150ms",
                }}
              >
                {s === "circle" ? (
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${theme.label}99` }} />
                ) : (
                  <svg viewBox={AVATAR_BLOB_SHAPES[s].viewBox} style={{ width: 30, height: 30, display: "block" }}>
                    <path d={AVATAR_BLOB_SHAPES[s].d} fill={`${theme.label}99`} />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* Social color toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.cardText, opacity: 0.5, flexShrink: 0 }}>Socials colors</span>
            <button
              type="button"
              title={pendingMono ? "Brand colors off" : "Brand colors on"}
              onClick={() => { setPendingMono((m) => !m); setThemeSaved(false); }}
              style={{
                width: 18, height: 18, flexShrink: 0, background: "none", border: "none",
                cursor: "pointer", padding: 0,
                outline: !pendingMono ? `2px solid ${theme.cardText}` : "2px solid transparent",
                outlineOffset: 2, borderRadius: "50%", transition: "outline-color 150ms",
              }}
            >
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: !pendingMono ? theme.label : `${theme.cardText}40`, transition: "background 150ms" }} />
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.5rem" }}>
            {themeSaved && (
              <span style={{ fontSize: "0.75rem", color: theme.label, fontWeight: 600 }}>Saved!</span>
            )}
            <button
              type="button"
              onClick={handleSaveTheme}
              disabled={!isDirty || themeSaving}
              style={{
                background: theme.bg,
                color: theme.text,
                border: "none", borderRadius: 20, padding: "0.3rem 0.9rem",
                fontSize: "0.75rem", fontWeight: 700, cursor: isDirty ? "pointer" : "default",
                opacity: themeSaving ? 0.5 : isDirty ? 1 : 0.25,
                transition: "opacity 200ms",
              }}
            >
              {themeSaving ? "…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
