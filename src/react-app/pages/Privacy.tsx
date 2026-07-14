// ---------------------------------------------------------------------------
// Privacy Policy page
// ---------------------------------------------------------------------------

import { useSeo } from "../lib/seo";
import { PageHeader, ShapeTitle } from "../components/ui";

export default function Privacy() {
  useSeo({ title: "Privacy Policy | LouLink" });

  return (
    <>
      <PageHeader />
      <ShapeTitle>Privacy Policy</ShapeTitle>
      <div className="settings-card" style={{ marginTop: "1.5rem", lineHeight: 1.6 }}>
        <p style={{ marginTop: 0, fontSize: "0.85rem", color: "#666" }}>Last updated: July 13, 2026</p>

        <h2>What we collect</h2>
        <p>
          When you create an account, we store your email address, name, and avatar image through our
          authentication provider (Neon Auth / Better Auth). We use a session cookie from our auth
          provider to keep you signed in — this cookie is required for the app to work and isn't used
          for tracking or advertising.
        </p>
        <p>
          When you set up your profile, we store what you enter: username, display name, bio, social
          links, category tags, and accent color. Avatar images you upload are stored in Cloudflare R2.
          If you import an avatar from a social profile instead, we fetch it through a third-party
          image service (unavatar.io).
        </p>

        <h2>Analytics on your LouLink page</h2>
        <p>
          If you have a LouLink profile, we track page views and link clicks so you can see how your
          page is performing. For each event we record the referrer, browser/OS/device type (parsed
          from your visitor's browser), and an approximate country/city (from Cloudflare's network, not
          an IP lookup). We do not store IP addresses. To count unique visitors without storing personal
          data, we compute a one-way hash of the visitor's IP and browser info that can't be reversed
          back to the original IP.
        </p>
        <p>
          Raw event data is deleted after 30 days. Aggregated daily totals (with no per-visitor detail)
          are kept indefinitely so your stats history stays available.
        </p>

        <h2>Third-party analytics</h2>
        <p>
          We use a cookie-free analytics tool (hosted at web.jxsen.com) on every LouLink page to
          understand overall site traffic. It does not use cookies and does not track you across other
          websites.
        </p>
        <p>
          We also load fonts from Google Fonts, which may see your IP address when your browser
          requests them.
        </p>

        <h2>How we use your data</h2>
        <p>
          We use the information above to operate your account, run your public profile page, show you
          analytics about your own page, and keep the site secure and working. We do not sell your data
          or share it with advertisers.
        </p>

        <h2>Your rights</h2>
        <p>
          You can update or remove most of your profile information yourself in Settings. To request a
          copy of your data or full account deletion, email us at{" "}
          <a href="mailto:privacy@loul.ink">privacy@loul.ink</a>.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy? Email <a href="mailto:privacy@loul.ink">privacy@loul.ink</a>.
        </p>
      </div>
    </>
  );
}
