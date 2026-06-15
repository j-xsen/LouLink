// ---------------------------------------------------------------------------
// Public profile page
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getCached, setCached } from "../lib/cache";
import { useSeo } from "../lib/seo";
import { Icon, BRAND_COLORS } from "../components/icons";
import { AvatarImage } from "../components/Avatar";
import { CATEGORY_LABELS, THEMES, type ProfileTheme } from "../types";

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
      })
      .catch(() => setStatus("not-found"));
  }, [username]);

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

  const theme = resolveTheme(profile?.accent_color, items);

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
    <div style={{ paddingBottom: "4rem", color: theme.text, "--accent": theme.label } as React.CSSProperties & { "--accent": string }}>
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
              const color = BRAND_COLORS[platform];
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
                    color: theme.text,
                    opacity: 0.4,
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
    </div>
  );
}
