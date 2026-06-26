// ---------------------------------------------------------------------------
// Forgot Password page
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "../auth-client";
import { useSeo } from "../lib/seo";
import { PageHeader, ShapeTitle, BlobButton } from "../components/ui";

export default function ForgotPassword() {
  const navigate = useNavigate();
  useSeo({ title: "Forgot Password | LouLink", noindex: true });
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await authClient.$fetch("/request-password-reset", {
      method: "POST",
      body: { email, redirectTo: `${window.location.origin}/reset-password` },
    });
    setSubmitted(true);
    setSubmitting(false);
  }

  return (
    <>
      <PageHeader />
      <ShapeTitle>Forgot password</ShapeTitle>
      <div className="settings-card" style={{ marginTop: "1.5rem" }}>
        {submitted ? (
          <>
            <p style={{ marginTop: 0 }}>If an account exists for that email, we've sent you a password reset link. Check your inbox and click it to set a new password.</p>
            <p style={{ marginBottom: 0 }}><button type="button" onClick={() => navigate("/signin")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Back to sign in</button></p>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <p style={{ marginTop: 0 }}>Enter your email and we'll send you a link to reset your password.</p>
            <p>
              <label>
                Email<br />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginTop: "0.5rem" }}>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button type="button" onClick={() => navigate("/signin")} style={{ borderRadius: 100, border: "2px solid #12080b", background: "transparent", color: "#12080b", padding: "0.45rem 1.4rem", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", letterSpacing: "0.03em" }}>Back</button>
              </div>
              <BlobButton disabled={submitting}>{submitting ? "Sending…" : "Send link"}</BlobButton>
              <div />
            </div>
          </form>
        )}
      </div>
    </>
  );
}
