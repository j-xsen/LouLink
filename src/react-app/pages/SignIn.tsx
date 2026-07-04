// ---------------------------------------------------------------------------
// Sign In page
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { authClient } from "../auth-client";
import { useAuth } from "../auth-context";
import { useSeo } from "../lib/seo";
import { PageHeader, ShapeTitle, BlobButton } from "../components/ui";

export default function SignIn() {
  const { loadSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  useSeo({ title: "Sign In | LouLink", noindex: true });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error } = await authClient.signIn.email({ email, password });
    if (error) { setError(error.message ?? "Sign in failed."); return; }
    await loadSession();
    navigate("/");
  }

  return (
    <>
      <PageHeader />
      <ShapeTitle>Sign in</ShapeTitle>
      <div className="settings-card" style={{ marginTop: "1.5rem" }}>
        {notice && <p style={{ marginTop: 0 }}>{notice}</p>}
        <form onSubmit={handleSubmit}>
          <p style={{ marginTop: 0 }}>
            <label>
              Email<br />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
          </p>
          <p>
            <label>
              Password<br />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button type="button" onClick={() => navigate("/forgot-password")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: "0.85rem", marginTop: "0.25rem", display: "block", opacity: 0.7 }}>Forgot password</button>
          </p>
          {error && <p><strong>{error}</strong></p>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginTop: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button type="button" onClick={() => navigate("/signup")} style={{ borderRadius: 100, border: "2px solid #12080b", background: "transparent", color: "#12080b", padding: "0.45rem 1.4rem", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", letterSpacing: "0.03em" }}>Sign up</button>
            </div>
            <BlobButton>Submit</BlobButton>
            <div />
          </div>
        </form>
      </div>
    </>
  );
}
