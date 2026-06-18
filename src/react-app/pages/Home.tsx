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
const shape1 = "/shapes/shape-1.svg";
const shape3 = "/shapes/shape-3.svg";
const shape4 = "/shapes/shape-4.svg";

export default function Home() {
  const { session } = useAuth();
  const cachedDir = getCached<DirectoryMember[]>("/api/directory");
  const [members, setMembers] = useState<DirectoryMember[]>(cachedDir ?? []);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(cachedDir ? "ready" : "loading");
  useSeo({
    title: "LouLink | Louisville Link Repertoire",
    description: "The free link page for Louisville artists, musicians, and local businesses. Browse the directory or claim your spot in Louisville's creative community.",
    url: "https://loul.ink",
    ogType: "website",
  });

  useEffect(() => {
    fetch("/api/directory", { credentials: "omit" })
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
          width="1847"
          height="862"
          fetchPriority="high"
          style={{ width: "min(55%, 220px)", height: "auto" }}
        /></Link>
      </div>
      <p style={{ textAlign: "center", margin: "1.25rem 0 0", opacity: 0.75, fontSize: "0.95rem" }}>
        A free resource for Louisville artists and businesses to compile their
        internet presences in a public repertoire of their peers.
      </p>
      <div style={{ display: "flex", gap: "0.25rem", marginTop: "1.25rem", marginBottom: "0.75rem" }}>
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
