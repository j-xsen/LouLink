// ---------------------------------------------------------------------------
// Content-Security-Policy for HTML responses.
//
// script-src allows:
//   - 'self'                     — Vite-built bundles
//   - the jxsen tracker origin   — analytics <script> in index.html
//   - 'unsafe-hashes' + sha256   — the font-preload onload="" handler in index.html
//                                  (hash of: this.onload=null;this.rel='stylesheet')
//   - an optional per-request nonce — SSR-injected window.__PROFILE__ script
//
// JSON-LD <script type="application/ld+json"> blocks are data, never executed,
// so CSP does not apply to them — no nonce needed there.
//
// style-src / img-src / connect-src are deliberately left unrestricted (no
// default-src): the app uses inline style attributes throughout and the SPA
// talks to the external Neon Auth origin. Locking those down needs its own
// audit; script-src alone already blunts injected-script XSS.
// ---------------------------------------------------------------------------

const FONT_ONLOAD_HASH = "'sha256-1jAmyYXcRq6zFldLe/GCgIDJBiOONdXjTLgEFMDnDSM='";
const JWS_TRACKER_ORIGIN = "https://web.jxsen.com";

export function htmlCsp(nonce?: string): string {
  const scriptSrc = [
    "'self'",
    JWS_TRACKER_ORIGIN,
    "'unsafe-hashes'",
    FONT_ONLOAD_HASH,
    ...(nonce ? [`'nonce-${nonce}'`] : []),
  ].join(" ");
  return `script-src ${scriptSrc}; object-src 'none'; base-uri 'self'; frame-ancestors 'self'`;
}
