// ---------------------------------------------------------------------------
// Create — link builder (no account required)
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "../auth";
import { deleteCached } from "../lib/cache";
import { getDraft, saveDraft, clearDraft } from "../lib/draft";
import { useSeo } from "../lib/seo";
import { validateUsername, useUsernameCheck } from "../lib/username";
import { PageHeader, ShapeTitle, BlobButton, DragHandle } from "../components/ui";
import { Icon, IconPicker, BRAND_COLORS } from "../components/icons";
import { useNavigationWarning } from "../lib/useNavigationWarning";
import type { DraftItem, DraftHeader } from "../types";

const DOMAIN_INFER: Record<string, { title: string; icon: string }> = {
  "youtube.com":    { title: "YouTube",    icon: "YouTube" },
  "youtu.be":       { title: "YouTube",    icon: "YouTube" },
  "instagram.com":  { title: "Instagram",  icon: "Instagram" },
  "facebook.com":   { title: "Facebook",   icon: "Facebook" },
  "fb.com":         { title: "Facebook",   icon: "Facebook" },
  "twitter.com":    { title: "Twitter",    icon: "Twitter" },
  "x.com":          { title: "Twitter",    icon: "Twitter" },
  "twitch.tv":      { title: "Twitch",     icon: "Twitch" },
  "spotify.com":    { title: "Spotify",    icon: "Spotify" },
  "bandcamp.com":   { title: "Bandcamp",   icon: "Bandcamp" },
  "soundcloud.com": { title: "SoundCloud", icon: "SoundCloud" },
};

function inferFromUrl(raw: string): { title?: string; icon?: string } {
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let hostname: string;
  try {
    hostname = new URL(candidate).hostname.replace(/^www\./, "");
  } catch {
    return {};
  }
  if (DOMAIN_INFER[hostname]) return DOMAIN_INFER[hostname];
  const name = hostname.split(".")[0];
  return { title: name.charAt(0).toUpperCase() + name.slice(1) };
}

export default function CreatePage() {
  const navigate = useNavigate();
  const { session, profile, loadSession } = useAuth();
  useSeo({ title: profile ? "Edit Links | LouLink" : "Build Your Page | LouLink", noindex: true });
  // New users (no profile) seed from localStorage draft; existing users load from the server below
  const [items, setItems] = useState<DraftItem[]>(() => profile ? [] : (getDraft().items ?? []));

  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(profile?.social_links ?? {});
  const [savedItems, setSavedItems] = useState<DraftItem[]>([]);
  const [savedSocialLinks, setSavedSocialLinks] = useState<Record<string, string>>({});

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
        const socials = d.profile?.social_links ?? {};
        setItems(loaded);
        setSavedItems(loaded);
        setSocialLinks(socials);
        setSavedSocialLinks(socials);
      })
      .catch(() => {});
  }, [profile?.username]);
  const hasChanges = profile != null && (
    JSON.stringify(items) !== JSON.stringify(savedItems) ||
    JSON.stringify(socialLinks) !== JSON.stringify(savedSocialLinks)
  );
  useNavigationWarning(hasChanges);

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
      deleteCached("/api/directory");
      await loadSession();
      navigate("/");
      return;
    }

    const [res] = await Promise.all([
      fetch("/api/me/links", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ links: items }),
      }),
      fetch("/api/me/social-links", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ social_links: socialLinks }),
      }),
    ]);
    if (!res.ok) {
      const d = await res.json();
      setSaveError(d.error ?? "Failed to save.");
      setSaving(false);
      return;
    }
    clearDraft();
    deleteCached(`/api/profile/${profile.username}`);
    setSavedItems(items);
    setSavedSocialLinks(socialLinks);
    navigate("/");
  }

  function handleCancel() {
    setItems(savedItems);
    setSocialLinks(savedSocialLinks);
    navigate("/");
  }

  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkIcon, setLinkIcon] = useState<string>("");
  const [showNewForm, setShowNewForm] = useState(() => (getDraft().items ?? []).length === 0);
  const [showNav, setShowNav] = useState(false);
  interface DragState {
    index: number;
    currentY: number;
    cardLeft: number;
    cardWidth: number;
    grabOffsetY: number;
  }
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragOverRef = useRef<number | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pointerYRef = useRef<number>(0);
  const dragIndex = drag?.index ?? null;

  function startDrag(e: React.PointerEvent, i: number) {
    e.preventDefault();
    const el = cardRefs.current[i];
    const rect = el?.getBoundingClientRect();
    setDrag({
      index: i,
      currentY: e.clientY,
      cardLeft: rect?.left ?? 0,
      cardWidth: rect?.width ?? 300,
      grabOffsetY: rect ? e.clientY - rect.top : 0,
    });
    dragOverRef.current = null;
    setDragOverIndex(null);
  }

  useEffect(() => {
    if (!drag) return;
    const { index } = drag;

    const SCROLL_ZONE = 80; // px from viewport edge that triggers auto-scroll
    const MAX_SPEED = 18;   // px per frame at the very edge
    let rafId: number | null = null;

    function scheduleScroll() {
      if (rafId !== null) return;
      function tick() {
        const y = pointerYRef.current;
        const vh = window.innerHeight;
        let speed = 0;
        if (y < SCROLL_ZONE) speed = -MAX_SPEED * (1 - y / SCROLL_ZONE);
        else if (y > vh - SCROLL_ZONE) speed = MAX_SPEED * (1 - (vh - y) / SCROLL_ZONE);
        if (speed !== 0) {
          window.scrollBy(0, speed);
          // Keep the ghost card position in sync after scroll
          setDrag(prev => prev ? { ...prev, currentY: pointerYRef.current } : null);
          rafId = requestAnimationFrame(tick);
        } else {
          rafId = null;
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    function onMove(e: PointerEvent) {
      e.preventDefault();
      pointerYRef.current = e.clientY;
      setDrag(prev => prev ? { ...prev, currentY: e.clientY } : null);
      scheduleScroll();
      // Cards stay in DOM (opacity 0) so positions are stable — hit-testing is accurate
      let over: number | null = null;
      for (let j = 0; j < cardRefs.current.length; j++) {
        if (j === index) continue;
        const el = cardRefs.current[j];
        if (!el) continue;
        const { top, bottom } = el.getBoundingClientRect();
        if (e.clientY >= top && e.clientY <= bottom) { over = j; break; }
      }
      dragOverRef.current = over;
      setDragOverIndex(over);
    }

    function onUp() {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      const over = dragOverRef.current;
      if (over !== null && over !== index) moveItem(index, over);
      setDrag(null);
      setDragOverIndex(null);
      dragOverRef.current = null;
    }

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateItems(next: DraftItem[]) {
    setItems(next);
    if (!profile) saveDraft({ items: next });
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
    setItems(prev => {
      const next = [...prev];
      next.splice(to, 0, next.splice(from, 1)[0]);
      if (!profile) saveDraft({ items: next });
      return next;
    });
  }

  const fieldLabel: React.CSSProperties = {
    display: "block",
    fontSize: "0.78rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#9ca3af",
    marginBottom: "0.25rem",
  };

  const ghostBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "0.85rem",
    color: "#9ca3af",
    padding: "0.25rem 0.5rem",
    letterSpacing: "0.03em",
  };

  return (
    <>
      <PageHeader right={profile && (
        <Link to="/settings" style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "#12080b", padding: 6, textDecoration: "none", fontSize: "0.875rem", fontWeight: 700, opacity: 1 }}>
          <SettingsIcon size={16} strokeWidth={2.5} />
          Settings
        </Link>
      )} />
      <div id="link-list" style={{ position: "relative", top: "-1rem" }} aria-hidden />
      <ShapeTitle>{profile ? "Edit your links" : "Build your page"}</ShapeTitle>
      {!profile && <p style={{ textAlign: "center", color: "#9ca3af", fontSize: "0.9rem" }}>Add your links below. You can create an account when you're ready to save.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "1.25rem" }}>
        {items.map((item, i) => {
          const isDragging = dragIndex === i;
          const isTarget = dragOverIndex === i && dragIndex !== null;
          return (
            <div
              key={i}
              ref={(el) => { cardRefs.current[i] = el; }}
              style={{ borderRadius: 14, opacity: isDragging ? 0 : 1, outline: isTarget ? "2px dashed #f78f1e" : "none", outlineOffset: 2 }}
            >
              {item.kind === "header" ? (
                <div style={{ background: "#fef3e2", border: "1px solid #f78f1e", borderLeft: "4px solid #f78f1e", borderRadius: 14, padding: "0.9rem 1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                    <div style={{ color: "#f78f1e", cursor: "grab", display: "flex", userSelect: "none", touchAction: "none" }} onPointerDown={(e) => startDrag(e, i)}>
                      <DragHandle size={18} />
                    </div>
                    <span style={{ fontFamily: "'Aladin', Georgia, serif", fontSize: "1rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#f78f1e", flex: 1 }}>Section</span>
                    <button type="button" onClick={() => removeItem(i)} style={{ ...ghostBtn, color: "#f78f1e", fontSize: "1rem", padding: "0 0.25rem" }}>×</button>
                  </div>
                  <label>
                    <span style={fieldLabel}>Label</span>
                    <input type="text" value={item.title} onChange={(e) => updateItem(i, { title: e.target.value })} />
                  </label>
                </div>
              ) : (
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "0.9rem 1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                    <div style={{ color: "#d1d5db", cursor: "grab", display: "flex", userSelect: "none", touchAction: "none" }} onPointerDown={(e) => startDrag(e, i)}>
                      <DragHandle size={18} />
                    </div>
                    <span style={{ fontFamily: "'Aladin', Georgia, serif", fontSize: "1.35rem", color: "#12080b", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title || "Untitled"}</span>
                    <button type="button" onClick={() => removeItem(i)} style={{ ...ghostBtn, fontSize: "1.1rem", padding: "0 0.25rem" }}>×</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    <label>
                      <span style={fieldLabel}>Title</span>
                      <input type="text" value={item.title} onChange={(e) => updateItem(i, { title: e.target.value })} />
                    </label>
                    <label>
                      <span style={fieldLabel}>URL</span>
                      <input type="text" value={item.url} onChange={(e) => {
                        const url = e.target.value;
                        const patch: Partial<DraftItem> = { url };
                        const inf = inferFromUrl(url);
                        if (!item.title.trim() && inf.title) patch.title = inf.title;
                        if (!item.icon && inf.icon) patch.icon = inf.icon;
                        updateItem(i, patch);
                      }} />
                    </label>
                    <div>
                      <span style={fieldLabel}>Icon</span>
                      <IconPicker value={item.icon ?? ""} onChange={(v) => updateItem(i, { icon: v || undefined })} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "1.25rem" }}>
        {showNewForm ? (
          <div className="settings-card">
            <p style={{ fontFamily: "'Aladin', Georgia, serif", fontSize: "1.2rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "#12080b", margin: "0 0 1rem" }}>Add a Link</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <label>
                <span style={fieldLabel}>Title</span>
                <input
                  type="text"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                />
              </label>
              <label>
                <span style={fieldLabel}>URL</span>
                <input
                  type="text"
                  value={linkUrl}
                  onChange={(e) => {
                    const url = e.target.value;
                    setLinkUrl(url);
                    const inf = inferFromUrl(url);
                    if (!linkTitle.trim() && inf.title) setLinkTitle(inf.title);
                    if (!linkIcon && inf.icon) setLinkIcon(inf.icon);
                  }}
                />
              </label>
              <div>
                <span style={fieldLabel}>Icon</span>
                <IconPicker value={linkIcon} onChange={setLinkIcon} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "center" }}>
                {(!linkTitle.trim() && !linkUrl.trim() && items.length > 0) && (
                  <button type="button" onClick={() => setShowNewForm(false)} style={ghostBtn}>Cancel</button>
                )}
              </div>
              <BlobButton
                type="button"
                onClick={addLink}
                disabled={!linkTitle.trim() || !linkUrl.trim()}
              >
                Add link
              </BlobButton>
              <div />
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem" }}>
            <button type="button" onClick={() => setShowNewForm(true)} style={{ ...ghostBtn, border: "1px solid #e5e7eb", borderRadius: 20, padding: "0.3rem 0.9rem", color: "#12080b" }}>+ Add link</button>
            <button type="button" onClick={addHeader} style={{ ...ghostBtn, border: "1px solid #e5e7eb", borderRadius: 20, padding: "0.3rem 0.9rem", color: "#12080b" }}>+ Add header</button>
          </div>
        )}
        {showNewForm && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: "0.5rem" }}>
            <button type="button" onClick={addHeader} style={ghostBtn}>+ Add section header</button>
          </div>
        )}
      </div>

      <div style={{ marginTop: "2rem" }} id="social-links">
        <ShapeTitle>Socials</ShapeTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "1.25rem" }}>
          {(["YouTube", "Instagram", "Facebook", "Twitter", "Twitch", "Spotify", "Bandcamp", "SoundCloud"] as const).map((platform) => {
            const color = BRAND_COLORS[platform];
            return (
              <label key={platform} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: `${color}18`, border: `1.5px solid ${color}`, flexShrink: 0, color }}>
                  <Icon name={platform} size={15} color={color} />
                </span>
                <input
                  type="url"
                  placeholder={`${platform} URL`}
                  value={socialLinks[platform] ?? ""}
                  onChange={(e) => setSocialLinks((prev) => ({ ...prev, [platform]: e.target.value }))}
                  style={{ flex: 1, margin: 0 }}
                />
              </label>
            );
          })}
        </div>
      </div>

      {session ? (
        <div style={{ marginTop: "2rem" }}>
          {!profile && (
            <div className="settings-card">
              <label>
                <span style={fieldLabel}>Username (loul.ink/…)</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                />
              </label>
              {username && (
                <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem", color: checkStatus === "available" ? "#16a34a" : checkStatus === "taken" || checkStatus === "invalid" ? "#dc2626" : "#9ca3af" }}>
                  {checkStatus === "checking" && "Checking…"}
                  {checkStatus === "available" && "✓ Available"}
                  {checkStatus === "taken" && "✗ Taken"}
                  {checkStatus === "invalid" && (validateUsername(username) ?? "Invalid")}
                </p>
              )}
            </div>
          )}
          {saveError && <p style={{ textAlign: "center", color: "#dc2626", fontWeight: 700 }}>{saveError}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              {profile && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={saving}
                  style={{ borderRadius: 100, border: "2px solid #12080b", background: "transparent", color: "#12080b", padding: "0.45rem 1.4rem", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", letterSpacing: "0.03em" }}
                >
                  Cancel
                </button>
              )}
            </div>
            <BlobButton
              type="button"
              onClick={handleSave}
              disabled={saving || (!profile && checkStatus !== "available")}
            >
              {saving ? "Saving…" : "Save page →"}
            </BlobButton>
            <div />
          </div>
        </div>
      ) : (
        <div style={{ marginTop: "2rem", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <BlobButton type="button" onClick={() => navigate("/signup", { state: { draftItems: items } })}>
              Create account to save →
            </BlobButton>
          </div>
          <p style={{ marginTop: "0.75rem", fontSize: "0.9rem", color: "#9ca3af" }}>
            Already have an account? <Link to="/signin">Sign in</Link>
          </p>
        </div>
      )}

      {/* Floating save button — bottom-left, only when there are unsaved changes */}
      {session && hasChanges && (
        <div style={{ position: "fixed", bottom: "1.5rem", left: "1.25rem", zIndex: 900 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              background: "#f78f1e",
              color: "#fff",
              border: "none",
              borderRadius: 100,
              padding: "0.6rem 1.4rem",
              fontWeight: 700,
              fontSize: "0.95rem",
              cursor: saving ? "default" : "pointer",
              boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
              opacity: saving ? 0.7 : 1,
              transition: "opacity 150ms ease",
              letterSpacing: "0.03em",
              whiteSpace: "nowrap",
            }}
          >
            {saving ? "Saving…" : "Save page →"}
          </button>
        </div>
      )}

      {/* Floating section-jump nav */}
      <div style={{ position: "fixed", bottom: "1.5rem", right: "1.25rem", zIndex: 900, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
        {showNav && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, boxShadow: "0 8px 28px rgba(0,0,0,0.13)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {[
              { label: "Links", id: "link-list" },
              { label: "Socials", id: "social-links" },
            ].map(({ label, id }) => (
              <button
                key={id}
                type="button"
                onClick={() => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); setShowNav(false); }}
                style={{ background: "none", border: "none", borderBottom: id === "link-list" ? "1px solid #f3f4f6" : "none", cursor: "pointer", padding: "0.7rem 1.2rem", textAlign: "left", fontFamily: "'Aladin', Georgia, serif", fontSize: "1rem", color: "#12080b", letterSpacing: "0.04em", whiteSpace: "nowrap" }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowNav(v => !v)}
          style={{ width: 44, height: 44, borderRadius: "50%", background: showNav ? "#12080b" : "#f78f1e", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.18)", transition: "background 150ms ease", color: "#fff", fontSize: "1.2rem", lineHeight: 1 }}
          aria-label="Jump to section"
        >
          {showNav ? "×" : "☰"}
        </button>
      </div>

      {/* Floating card that follows the pointer during drag */}
      {drag !== null && (() => {
        const item = items[drag.index];
        return (
          <div style={{
            position: "fixed",
            left: drag.cardLeft,
            width: drag.cardWidth,
            top: drag.currentY - drag.grabOffsetY,
            zIndex: 1000,
            pointerEvents: "none",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            boxShadow: "0 10px 36px rgba(0,0,0,0.18)",
            padding: "0.9rem 1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            opacity: 0.92,
          }}>
            <DragHandle size={18} />
            <span style={{ fontFamily: "'Aladin', Georgia, serif", fontSize: "1.35rem", color: "#12080b", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.title || "Untitled"}
            </span>
          </div>
        );
      })()}
    </>
  );
}
