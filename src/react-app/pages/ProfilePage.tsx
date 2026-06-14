// ---------------------------------------------------------------------------
// Public profile page
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getCached, setCached } from "../lib/cache";
import { useSeo } from "../lib/seo";
import { Icon, BRAND_COLORS } from "../components/icons";
import { AvatarImage } from "../components/Avatar";
import { CATEGORY_LABELS } from "../types";

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
};

function getFaviconUrl(url: string): string {
  try {
    const { hostname } = new URL(url);
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
  } catch {
    return "";
  }
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
            const faviconUrl = getFaviconUrl(item.url);
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
