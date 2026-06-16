// ---------------------------------------------------------------------------
// Analytics utilities — Workers-compatible, no npm deps
// ---------------------------------------------------------------------------

const BOT_UA_RE = /bot|crawler|spider|crawling|facebookexternalhit|twitterbot|slackbot|linkedinbot|whatsapp|discordbot|curl|wget|python-requests|python-urllib|java\/|go-http|okhttp/i;

export function isBot(ua: string | null | undefined): boolean {
  if (!ua) return true;
  return BOT_UA_RE.test(ua);
}

export function parseUserAgent(ua: string): { browser: string; os: string; device_type: "desktop" | "mobile" | "tablet" } {
  let browser = "Other";
  if (/Edg\//.test(ua))              browser = "Edge";
  else if (/OPR\/|Opera/.test(ua))   browser = "Opera";
  else if (/SamsungBrowser/.test(ua)) browser = "Samsung";
  else if (/Chrome\//.test(ua))      browser = "Chrome";
  else if (/Firefox\//.test(ua))     browser = "Firefox";
  else if (/Safari\//.test(ua))      browser = "Safari";

  let os = "Other";
  if (/Windows NT/.test(ua))         os = "Windows";
  else if (/CrOS/.test(ua))          os = "ChromeOS";
  else if (/Android/.test(ua))       os = "Android";
  else if (/iPhone|iPad/.test(ua))   os = "iOS";
  else if (/Mac OS X/.test(ua))      os = "macOS";
  else if (/Linux/.test(ua))         os = "Linux";

  let device_type: "desktop" | "mobile" | "tablet" = "desktop";
  if (/iPad|Tablet/.test(ua))        device_type = "tablet";
  else if (/Mobi|Android/.test(ua))  device_type = "mobile";

  return { browser, os, device_type };
}

const SOCIAL_DOMAINS = new Set([
  "instagram.com", "facebook.com", "twitter.com", "x.com",
  "t.co", "tiktok.com", "linkedin.com", "youtube.com", "youtu.be",
  "reddit.com", "pinterest.com", "snapchat.com", "threads.net",
  "bsky.app", "mastodon.social", "fb.me", "l.instagram.com",
]);

const SEARCH_DOMAINS = new Set([
  "google.com", "bing.com", "duckduckgo.com", "yahoo.com",
  "ecosia.org", "startpage.com", "brave.com", "kagi.com",
  "yandex.com", "baidu.com", "ask.com",
]);

export function classifyReferrer(referrer: string | null | undefined): "direct" | "social" | "search" | "referral" {
  if (!referrer || referrer.trim() === "") return "direct";
  let hostname: string;
  try {
    hostname = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "referral";
  }
  if (SOCIAL_DOMAINS.has(hostname)) return "social";
  if (SEARCH_DOMAINS.has(hostname)) return "search";
  return "referral";
}

export function mergeJsonbCounts(rows: Record<string, unknown>[], key: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) {
    const obj = row[key] as Record<string, number> | null;
    if (!obj) continue;
    for (const [k, v] of Object.entries(obj)) {
      result[k] = (result[k] ?? 0) + (typeof v === "number" ? v : 0);
    }
  }
  return result;
}
