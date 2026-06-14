// ---------------------------------------------------------------------------
// Create — link builder (no account required)
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GripVertical } from "lucide-react";
import { useAuth } from "../auth";
import { deleteCached } from "../lib/cache";
import { getDraft, saveDraft, clearDraft } from "../lib/draft";
import { useSeo } from "../lib/seo";
import { validateUsername, useUsernameCheck } from "../lib/username";
import { PageHeader, ShapeTitle } from "../components/ui";
import { Icon, IconPicker, BRAND_COLORS } from "../components/icons";
import type { DraftItem, DraftHeader } from "../types";

export default function CreatePage() {
  const navigate = useNavigate();
  const { session, profile, loadSession } = useAuth();
  useSeo({ title: profile ? "Edit Links | LouLink" : "Build Your Page | LouLink", noindex: true });
  // New users seed from localStorage draft; existing users load from the server below
  const [items, setItems] = useState<DraftItem[]>(() => getDraft().items ?? []);

  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(profile?.social_links ?? {});

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
        if (d.profile?.social_links) setSocialLinks(d.profile.social_links);
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
      transform: isOver ? `translateY(${dragIndex! < i ? "-16px" : "16px"})` : "none",
      transition: "transform 150ms ease",
    };
  }

  return (
    <>
      <PageHeader />
      <ShapeTitle>{profile ? "Edit your links" : "Build your page"}</ShapeTitle>
      <div style={{ textAlign: "center", marginTop: "0.5rem" }}>
        <button type="button" onClick={() => document.getElementById("social-links")?.scrollIntoView({ behavior: "smooth" })} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 20, cursor: "pointer", fontSize: "0.8rem", color: "#9ca3af", letterSpacing: "0.05em", padding: "0.3rem 0.9rem" }}>↓ Social links</button>
      </div>
      {!profile && <p>Add your links below. You can create an account when you're ready to save.</p>}

      <div id="link-list">
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
      </div>

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

      <hr />
      <div id="social-links" style={{ marginTop: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <p style={{ fontWeight: 700, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.08em", color: "#9ca3af", margin: 0 }}>Social links</p>
          <button type="button" onClick={() => document.getElementById("link-list")?.scrollIntoView({ behavior: "smooth" })} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 20, cursor: "pointer", fontSize: "0.8rem", color: "#9ca3af", letterSpacing: "0.05em", padding: "0.3rem 0.9rem" }}>↑ Links</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
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
