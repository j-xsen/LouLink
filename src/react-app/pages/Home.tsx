// ---------------------------------------------------------------------------
// Home — landing page
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { getCached, setCached } from "../lib/cache";
import { useSeo } from "../lib/seo";
import { ShapeButton } from "../components/ui";
import { GroupedDirectory } from "../components/Directory";
import type { DirectoryMember } from "../types";
import logoFullColor from "../assets/logo-full-color.svg";
import shape1 from "../assets/shape-1.svg";
import shape3 from "../assets/shape-3.svg";
import shape4 from "../assets/shape-4.svg";

export default function Home() {
  const { session } = useAuth();
  const cachedDir = getCached<DirectoryMember[]>("/api/directory");
  const [members, setMembers] = useState<DirectoryMember[]>(cachedDir ?? []);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(cachedDir ? "ready" : "loading");
  useSeo({ title: "LouLink | Louisville Link Repertoire" });

  useEffect(() => {
    if (cachedDir) return;
    fetch("/api/directory")
      .then((r) => r.json())
      .then((data) => { setCached("/api/directory", data); setMembers(data as DirectoryMember[]); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <>
      <div style={{ textAlign: "center", padding: "0.5rem 0 0" }}>
        <Link to="/"><img
          src={logoFullColor}
          alt="LouLink"
          style={{ width: "min(55%, 220px)", height: "auto" }}
        /></Link>
      </div>
      <div style={{ display: "flex", gap: "0.25rem", marginTop: "2rem", marginBottom: "0.75rem" }}>
        {session ? (
          <ShapeButton to="/signup" shape={shape1} style={{ flex: 1 }}>Complete profile</ShapeButton>
        ) : (
          <>
            <ShapeButton to="/signin" shape={shape3} style={{ flex: 1 }}>Sign in</ShapeButton>
            <ShapeButton to="/signup" shape={shape1} style={{ flex: 1 }}>Sign up</ShapeButton>
          </>
        )}
        <ShapeButton to="/create" shape={shape4} style={{ flex: 1 }}>Create</ShapeButton>
      </div>
      <hr style={{ margin: "1.5rem 0", opacity: 0.2 }} />
      {status === "loading" && <p style={{ opacity: 0.5 }}>Loading members…</p>}
      {status === "error" && <p style={{ opacity: 0.5 }}>Could not load the directory.</p>}
      {status === "ready" && members.length === 0 && (
        <p style={{ opacity: 0.5 }}>No verified members yet.</p>
      )}
      {status === "ready" && members.length > 0 && (
        <GroupedDirectory members={members} />
      )}
    </>
  );
}
