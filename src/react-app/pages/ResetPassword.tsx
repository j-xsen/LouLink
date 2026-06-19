// ---------------------------------------------------------------------------
// Reset Password page
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSeo } from "../lib/seo";
import { PageHeader, ShapeTitle, BlobButton } from "../components/ui";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  useSeo({ title: "Reset Password | LouLink", noindex: true });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <>
        <PageHeader />
        <ShapeTitle>Reset password</ShapeTitle>
        <div className="settings-card" style={{ marginTop: "1.5rem" }}>
          <p style={{ marginTop: 0 }}>This reset link is invalid or has expired.</p>
          <p><button type="button" onClick={() => navigate("/forgot-password")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Request a new one</button></p>
        </div>
      </>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: password }),
    });
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setError(d.error ?? "Reset failed. The link may have expired.");
      setSubmitting(false);
      return;
    }
    navigate("/signin", { state: { notice: "Password updated. Sign in with your new password." } });
  }

  return (
    <>
      <PageHeader />
      <ShapeTitle>Reset password</ShapeTitle>
      <div className="settings-card" style={{ marginTop: "1.5rem" }}>
        <form onSubmit={handleSubmit}>
          <p style={{ marginTop: 0 }}>
            <label>
              New password<br />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {password && (
              <span style={{ fontSize: "0.85rem", display: "block", marginTop: "0.25rem" }}>
                {password.length >= 8 ? "✓ Good" : `✗ Too short (${password.length}/8)`}
              </span>
            )}
          </p>
          <p>
            <label>
              Confirm password<br />
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </label>
            {confirm && (
              <span style={{ fontSize: "0.85rem", display: "block", marginTop: "0.25rem" }}>
                {password === confirm ? "✓ Matches" : "✗ Doesn't match"}
              </span>
            )}
          </p>
          {error && <p><strong>{error}</strong></p>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginTop: "0.5rem" }}>
            <div />
            <BlobButton disabled={submitting || password.length < 8 || password !== confirm}>
              {submitting ? "Saving…" : "Update password"}
            </BlobButton>
            <div />
          </div>
        </form>
      </div>
    </>
  );
}
