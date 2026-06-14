// ---------------------------------------------------------------------------
// Directory components
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Link } from "react-router-dom";
import { CATEGORY_LABELS, type DirectoryMember } from "../types";
import { AvatarImage } from "./Avatar";

export function MemberCard({ member }: { member: DirectoryMember }) {
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
          {bio && (
            <div style={{ fontSize: "0.95rem", marginTop: "0.2rem", opacity: 0.8 }}>{bio}</div>
          )}
        </div>
      </div>
    </Link>
  );
}

export function GroupedDirectory({ members }: { members: DirectoryMember[] }) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const categoryOrder = Object.keys(CATEGORY_LABELS);

  // Assign each member to its first matching category (in defined order)
  const groups: Record<string, DirectoryMember[]> = {};
  for (const cat of categoryOrder) groups[cat] = [];
  const uncategorized: DirectoryMember[] = [];

  for (const m of members) {
    const match = categoryOrder.find((c) => m.categories.includes(c));
    if (match) groups[match].push(m);
    else uncategorized.push(m);
  }

  const sections = categoryOrder.filter((c) => groups[c].length > 0);
  const hasUncategorized = uncategorized.length > 0;

  const pillBase: React.CSSProperties = {
    padding: "5px 14px",
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    background: "transparent",
    color: "inherit",
    fontSize: "0.78rem",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
    fontFamily: "inherit",
  };
  const pillActive: React.CSSProperties = {
    background: "#12080b",
    borderColor: "#12080b",
    color: "#fff",
  };

  const filteredMembers = activeFilter
    ? members.filter((m) => m.categories.includes(activeFilter))
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Filter pills */}
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        <button
          type="button"
          style={{ ...pillBase, ...(activeFilter === null ? pillActive : {}) }}
          onClick={() => setActiveFilter(null)}
        >
          All
        </button>
        {sections.map((cat) => (
          <button
            key={cat}
            type="button"
            style={{ ...pillBase, ...(activeFilter === cat ? pillActive : {}) }}
            onClick={() => setActiveFilter(activeFilter === cat ? null : cat)}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
        {hasUncategorized && (
          <button
            type="button"
            style={{ ...pillBase, ...(activeFilter === "__other" ? pillActive : {}) }}
            onClick={() => setActiveFilter(activeFilter === "__other" ? null : "__other")}
          >
            Other
          </button>
        )}
      </div>

      {/* Filtered flat list */}
      {filteredMembers !== null ? (
        filteredMembers.length === 0 ? (
          <p style={{ opacity: 0.5 }}>No members in this category.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {filteredMembers.map((m) => <MemberCard key={m.username} member={m} />)}
          </div>
        )
      ) : (
        /* Grouped "All" view */
        <>
          {sections.map((cat) => (
            <div key={cat}>
              <div style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                opacity: 0.45,
                marginBottom: "0.5rem",
              }}>
                {CATEGORY_LABELS[cat]}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {groups[cat].map((m) => <MemberCard key={m.username} member={m} />)}
              </div>
            </div>
          ))}
          {hasUncategorized && (
            <div>
              <div style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                opacity: 0.45,
                marginBottom: "0.5rem",
              }}>
                Other
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {uncategorized.map((m) => <MemberCard key={m.username} member={m} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
