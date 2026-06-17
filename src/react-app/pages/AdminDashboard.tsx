// ---------------------------------------------------------------------------
// Admin Dashboard — localhost only, secured by ADMIN_KEY
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

const CATEGORIES = ["music", "visual-art", "food", "retail", "community"] as const;
type Category = (typeof CATEGORIES)[number];

interface AdminUser {
  id: string;
  username: string | null;
  display_name: string | null;
  verified: boolean | null;
  categories: Category[] | null;
  hide_from_directory: boolean | null;
  created_at: string;
}

export default function AdminDashboard() {
  const isLocalhost =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  const [adminKey, setAdminKey] = useState(
    () => sessionStorage.getItem("admin_key") || (import.meta.env.VITE_ADMIN_KEY as string | undefined) || ""
  );
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingCategories, setEditingCategories] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<Category[]>([]);

  useEffect(() => {
    sessionStorage.setItem("admin_key", adminKey);
  }, [adminKey]);

  if (!isLocalhost) {
    return <p style={{ padding: "2rem", textAlign: "center", color: "#9ca3af" }}>Admin dashboard is only available on localhost.</p>;
  }

  function authHeaders() {
    return { Authorization: `Bearer ${adminKey}`, "Content-Type": "application/json" };
  }

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", { headers: authHeaders() });
      if (!res.ok) { setError(`Error ${res.status}`); setLoading(false); return; }
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }

  async function toggleVerified(user: AdminUser) {
    const next = !user.verified;
    const res = await fetch(`/api/admin/profiles/${user.username}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ verified: next }),
    });
    if (!res.ok) { const d = await res.json(); alert(d.error ?? "Failed"); return; }
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, verified: next } : u));
  }

  async function saveCategories(user: AdminUser) {
    const res = await fetch(`/api/admin/profiles/${user.username}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ categories: categoryDraft }),
    });
    if (!res.ok) { const d = await res.json(); alert(d.error ?? "Failed"); return; }
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, categories: categoryDraft } : u));
    setEditingCategories(null);
  }

  async function deleteProfile(user: AdminUser) {
    if (!user.username) { alert("No profile to delete — delete the auth user in Neon Console."); return; }
    if (!confirm(`Delete profile for /${user.username}? This cascades to all links and analytics.`)) return;
    const res = await fetch(`/api/admin/profiles/${user.username}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) { const d = await res.json(); alert(d.error ?? "Failed"); return; }
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, username: null, display_name: null, verified: null, categories: null } : u));
  }

  return (
    <div style={{ padding: "1rem", fontFamily: "system-ui, sans-serif", maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 1.25rem" }}>Admin</h1>

      {/* Key + load */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.25rem" }}>
        <input
          type="password"
          placeholder="ADMIN_KEY"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          style={{ padding: "0.6rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 8, fontSize: "1rem", width: "100%", boxSizing: "border-box" }}
        />
        <button
          onClick={loadUsers}
          disabled={!adminKey || loading}
          style={{ padding: "0.65rem", background: "#12080b", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: "1rem", fontWeight: 600, opacity: (!adminKey || loading) ? 0.5 : 1 }}
        >
          {loading ? "Loading…" : "Load users"}
        </button>
        {error && <p style={{ margin: 0, color: "#dc2626", fontSize: "0.9rem" }}>{error}</p>}
      </div>

      {/* User cards */}
      {users.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <p style={{ margin: "0 0 0.25rem", fontSize: "0.8rem", color: "#9ca3af" }}>{users.length} user{users.length !== 1 ? "s" : ""}</p>

          {users.map((user) => (
            <div
              key={user.id}
              style={{
                background: "#fff",
                border: `1px solid ${user.verified ? "#bbf7d0" : "#e5e7eb"}`,
                borderRadius: 12,
                padding: "1rem",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              {/* Name + username row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "1rem" }}>{user.display_name ?? <span style={{ color: "#9ca3af" }}>No profile</span>}</div>
                  {user.username
                    ? <a href={`/${user.username}`} target="_blank" rel="noreferrer" style={{ fontSize: "0.85rem", color: "#f78f1e", textDecoration: "none" }}>/{user.username}</a>
                    : <span style={{ fontSize: "0.85rem", color: "#9ca3af" }}>no username</span>
                  }
                </div>
                <div style={{ fontSize: "0.75rem", color: "#9ca3af", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {new Date(user.created_at).toLocaleDateString()}
                </div>
              </div>

              {user.username && (
                <>
                  {/* Verified toggle */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                    <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>Verified</span>
                    <button
                      onClick={() => toggleVerified(user)}
                      style={{
                        padding: "0.3rem 0.9rem",
                        borderRadius: 20,
                        border: "none",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        background: user.verified ? "#16a34a" : "#e5e7eb",
                        color: user.verified ? "#fff" : "#374151",
                      }}
                    >
                      {user.verified ? "✓ Verified" : "Not verified"}
                    </button>
                  </div>

                  {/* Categories */}
                  <div style={{ marginBottom: "0.75rem" }}>
                    <div style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "0.4rem" }}>Categories</div>
                    {editingCategories === user.id ? (
                      <div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.6rem" }}>
                          {CATEGORIES.map((cat) => (
                            <label key={cat} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.9rem", cursor: "pointer", background: categoryDraft.includes(cat) ? "#fef3e2" : "#f9fafb", border: `1px solid ${categoryDraft.includes(cat) ? "#f78f1e" : "#e5e7eb"}`, borderRadius: 6, padding: "0.25rem 0.6rem" }}>
                              <input
                                type="checkbox"
                                checked={categoryDraft.includes(cat)}
                                onChange={(e) => setCategoryDraft((prev) => e.target.checked ? [...prev, cat] : prev.filter((c) => c !== cat))}
                                style={{ margin: 0 }}
                              />
                              {cat}
                            </label>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button onClick={() => saveCategories(user)} style={{ flex: 1, padding: "0.5rem", fontSize: "0.9rem", background: "#12080b", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Save</button>
                          <button onClick={() => setEditingCategories(null)} style={{ flex: 1, padding: "0.5rem", fontSize: "0.9rem", background: "none", border: "1px solid #d1d5db", borderRadius: 8, cursor: "pointer" }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingCategories(user.id); setCategoryDraft(user.categories ?? []); }}
                        style={{ width: "100%", textAlign: "left", background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 8, padding: "0.5rem 0.75rem", cursor: "pointer", fontSize: "0.85rem", color: user.categories?.length ? "#374151" : "#9ca3af" }}
                      >
                        {user.categories?.length ? user.categories.join(", ") : "tap to set categories"}
                      </button>
                    )}
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => deleteProfile(user)}
                    style={{ width: "100%", padding: "0.5rem", fontSize: "0.85rem", background: "none", border: "1px solid #fca5a5", borderRadius: 8, color: "#dc2626", cursor: "pointer" }}
                  >
                    Delete profile
                  </button>
                </>
              )}
            </div>
          ))}

          <p style={{ fontSize: "0.75rem", color: "#9ca3af", textAlign: "center", margin: "0.25rem 0 1rem" }}>
            "Delete profile" removes the public profile + links + analytics. Delete the auth user separately in Neon Console → Auth.
          </p>
        </div>
      )}
    </div>
  );
}
