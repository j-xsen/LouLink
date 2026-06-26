// ---------------------------------------------------------------------------
// Sign Up page
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { authClient, getJwt } from "../auth-client";
import { useAuth } from "../auth";
import { clearDraft } from "../lib/draft";
import type { DraftItem } from "../types";
import { useSeo } from "../lib/seo";
import { validateUsername, useUsernameCheck } from "../lib/username";
import { PageHeader, ShapeTitle, BlobButton } from "../components/ui";

export default function SignUp() {
  const { session, loadSession } = useAuth();
  const location = useLocation();
  const draftItems: DraftItem[] = (location.state as { draftItems?: DraftItem[] } | null)?.draftItems ?? [];
  const navigate = useNavigate();
  useSeo({ title: "Sign Up | LouLink", noindex: true });
  const [displayName, setDisplayName] = useState(session?.name ?? "");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const checkStatus = useUsernameCheck(username);
  const [showEmailNote, setShowEmailNote] = useState(false);

  const hasSession = !!session;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const usernameValid = checkStatus === "available" && !validateUsername(username);
  const canSubmit =
    displayName.trim().length > 0 &&
    usernameValid &&
    (hasSession || (emailValid && password.length >= 8)) &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");

    let jwt: string | null = null;

    if (hasSession) {
      jwt = await getJwt();
      if (!jwt) {
        setError("Could not obtain auth token.");
        setSubmitting(false);
        return;
      }
    } else {
      const { error: signUpError } = await authClient.signUp.email({
        name: displayName,
        email,
        password,
      });
      if (signUpError) {
        // If the auth account already exists, the user may have a partial signup
        // (auth record created, but onboarding never completed). Try signing in
        // with the provided credentials so they can finish setup.
        const isExistingAccount =
          signUpError.status === 422 ||
          signUpError.message?.toLowerCase().includes("already exists") ||
          signUpError.message?.toLowerCase().includes("user already exists");
        if (isExistingAccount) {
          const { error: signInError } = await authClient.signIn.email({ email, password });
          if (signInError) {
            setError("An account with this email already exists. Try signing in.");
            setSubmitting(false);
            return;
          }
          // Session now established — fall through to onboarding
        } else {
          setError(signUpError.message ?? "Sign up failed.");
          setSubmitting(false);
          return;
        }
      }

      const { data } = await authClient.getSession();
      if (!data?.session) {
        setError("Could not establish session after sign up.");
        setSubmitting(false);
        return;
      }

      jwt = await getJwt();
      if (!jwt) {
        setError("Could not obtain auth token after sign up.");
        setSubmitting(false);
        return;
      }
    }

    // Use items passed via router state from /create — never read localStorage here,
    // since stale drafts from other users can persist across sessions.
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        username,
        display_name: displayName.trim(),
        links: draftItems,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Failed to create profile.");
      setSubmitting(false);
      return;
    }

    clearDraft();
    await loadSession();
    navigate("/");
  }

  return (
    <>
      <PageHeader />
      <ShapeTitle>{hasSession ? "Choose a username" : "Create account"}</ShapeTitle>
      <div className="settings-card" style={{ marginTop: "1.5rem" }}>
        <form onSubmit={handleSubmit}>
          <p style={{ marginTop: 0 }}>
            <label>
              Display name<br />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </label>
          </p>
          <p>
            <label>
              Username (loul.ink/…)<br />
              <input
                type="text"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                }
                required
              />
            </label>
            {username && (
              <span style={{ fontSize: "0.85rem", display: "block", marginTop: "0.25rem" }}>
                {checkStatus === "checking" && "Checking…"}
                {checkStatus === "available" && "✓ Available"}
                {checkStatus === "taken" && "✗ Taken"}
                {checkStatus === "invalid" && (validateUsername(username) ?? "Invalid")}
              </span>
            )}
          </p>
          {!hasSession && (
            <>
              <p>
                <label>
                  Email <button type="button" onClick={() => setShowEmailNote(n => !n)} style={{ background: "none", border: "1px solid currentColor", borderRadius: "50%", width: "1.1em", height: "1.1em", fontSize: "0.75em", cursor: "pointer", padding: 0, lineHeight: 1, verticalAlign: "middle", opacity: 0.6 }}>i</button><br />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </label>
                {showEmailNote && (
                  <span style={{ fontSize: "0.85rem", display: "block", marginTop: "0.25rem", opacity: 0.7 }}>Only used if you ever need to reset your password.</span>
                )}
                {email && (
                  <span style={{ fontSize: "0.85rem", display: "block", marginTop: "0.25rem" }}>
                    {emailValid ? "✓ Valid" : "✗ Invalid email"}
                  </span>
                )}
              </p>
              <p>
                <label>
                  Password<br />
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </label>
                {password && (
                  <span style={{ fontSize: "0.85rem", display: "block", marginTop: "0.25rem" }}>
                    {password.length >= 8 ? "✓ Good" : `✗ Too short (${password.length}/8)`}
                  </span>
                )}
              </p>
            </>
          )}
          {error && <p><strong>{error}</strong></p>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginTop: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button type="button" onClick={() => navigate("/signin")} style={{ borderRadius: 100, border: "2px solid #12080b", background: "transparent", color: "#12080b", padding: "0.45rem 1.4rem", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", letterSpacing: "0.03em" }}>Sign in</button>
            </div>
            <BlobButton disabled={!canSubmit}>
              {submitting ? "Saving…" : hasSession ? "Finish setup" : "Submit"}
            </BlobButton>
            <div />
          </div>
        </form>
      </div>
    </>
  );
}
