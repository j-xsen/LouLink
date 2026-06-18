// ---------------------------------------------------------------------------
// Dashboard — authenticated home view
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "../auth";
import { getCached, setCached } from "../lib/cache";
import { useSeo } from "../lib/seo";
import { ShapeButton } from "../components/ui";
import { GroupedDirectory } from "../components/Directory";
import type { DirectoryMember } from "../types";
import logoFullColor from "../assets/logo-full-color.svg";
const shape1 = "/shapes/shape-1.svg";
const shape2 = "/shapes/shape-2.svg";
const shape3 = "/shapes/shape-3.svg";

export default function Dashboard() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const cachedDir = getCached<DirectoryMember[]>("/api/directory");
  const [members, setMembers] = useState<DirectoryMember[]>(cachedDir ?? []);
  const [dirStatus, setDirStatus] = useState<"loading" | "ready" | "error">(cachedDir ? "ready" : "loading");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useSeo({ title: "LouLink | Louisville Link Repertoire" });

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  useEffect(() => {
    fetch("/api/directory")
      .then((r) => r.json())
      .then((data) => { setCached("/api/directory", data); setMembers(data as DirectoryMember[]); setDirStatus("ready"); })
      .catch(() => setDirStatus("error"));
  }, []);

  if (!profile) return null;

  return (
    <>
      <div style={{ textAlign: "center", padding: "0.5rem 0 0" }}>
        <Link to="/"><img
          src={logoFullColor}
          alt="LouLink"
          style={{ width: "min(55%, 220px)", height: "auto" }}
        /></Link>
      </div>
      <div style={{ display: "flex", gap: "0.25rem", marginTop: "2rem", marginBottom: "0.75rem", alignItems: "center" }}>
        <ShapeButton to="/create" shape={shape2} style={{ flex: 1 }}>Edit links</ShapeButton>
        <ShapeButton to={`/${profile.username}`} shape={shape1} style={{ flex: 1 }}>My page</ShapeButton>
        <span className="analytics-btn">
          <ShapeButton to="/analytics" shape={shape3} style={{ flex: 1 }}>Analytics</ShapeButton>
        </span>
        <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 6 }}
            aria-label="Account menu"
          >
            <SettingsIcon size={22} />
          </button>
          {menuOpen && (
            <div style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 4px)",
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
              minWidth: 160,
              zIndex: 100,
              overflow: "hidden",
            }}>
              <Link
                to="/analytics"
                className="analytics-menu-item"
                style={{ display: "block", padding: "0.65rem 1rem", textDecoration: "none", color: "inherit", fontSize: "0.9rem" }}
                onClick={() => setMenuOpen(false)}
              >
                Analytics
              </Link>
              <Link
                to="/settings"
                style={{ display: "block", padding: "0.65rem 1rem", textDecoration: "none", color: "inherit", fontSize: "0.9rem", borderTop: "1px solid #f3f4f6" }}
                onClick={() => setMenuOpen(false)}
              >
                Settings
              </Link>
              <button
                type="button"
                onClick={async () => { setMenuOpen(false); await signOut(); navigate("/"); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "0.65rem 1rem", background: "none", border: "none", borderTop: "1px solid #f3f4f6", cursor: "pointer", fontSize: "0.9rem", color: "inherit" }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
      <hr style={{ margin: "1.5rem 0", opacity: 0.2 }} />
      {!profile.verified && (
        <div style={{
          background: "#fff7ed",
          border: "1px solid #fed7aa",
          borderRadius: "0.75rem",
          padding: "1rem 1.25rem",
          margin: "0 0 1rem",
        }}>
          <p style={{ fontWeight: 700, color: "#9a3412", margin: "0 0 0.25rem" }}>
            Page not appearing?
          </p>
          <p style={{ color: "#7c2d12", margin: 0, fontSize: "0.9rem" }}>
            Profiles only show up in the repertoire after human verification.
          </p>
        </div>
      )}
      {dirStatus === "loading" && <p style={{ opacity: 0.5 }}>Loading members…</p>}
      {dirStatus === "error" && <p style={{ opacity: 0.5 }}>Could not load the directory.</p>}
      {dirStatus === "ready" && members.length === 0 && (
        <p style={{ opacity: 0.5 }}>No verified members yet.</p>
      )}
      {dirStatus === "ready" && members.length > 0 && (
        <GroupedDirectory members={members} />
      )}
    </>
  );
}
