// ---------------------------------------------------------------------------
// Shared TypeScript types + constants
// ---------------------------------------------------------------------------

export type SessionData = { token: string; name: string };
export type ProfileData = {
  username: string;
  display_name: string;
  bio: string | null;
  avatarUrl: string | null;
  categories: string[];
  social_links: Record<string, string>;
  accent_color: string | null;
};
export type DraftLink = { kind: "link"; title: string; url: string; icon?: string };
export type DraftHeader = { kind: "header"; title: string };
export type DraftItem = DraftLink | DraftHeader;
export type Draft = { items: DraftItem[] };

export type DirectoryMember = {
  username: string;
  display_name: string;
  bio: string | null;
  categories: string[];
  avatarUrl: string | null;
};

export type ProfileTheme = {
  bg: string;
  card: string;
  text: string;
  label: string;
};

export const THEMES: Record<string, ProfileTheme> = {
  derby:     { bg: "#f5aaaa", card: "#ffffff", text: "#2d0808", label: "#c8102e" },
  bluegrass: { bg: "#8ecfaa", card: "#ffffff", text: "#071a0e", label: "#1a6635" },
  river:     { bg: "#8ab8e8", card: "#ffffff", text: "#081428", label: "#1a4fd6" },
  bourbon:   { bg: "#f5a030", card: "#fffdf0", text: "#2c1800", label: "#8a4500" },
  lilac:     { bg: "#c898e8", card: "#ffffff", text: "#180828", label: "#6b20e0" },
  midnight:  { bg: "#0f1629", card: "#1a2744", text: "#e2eaf8", label: "#93b4f0" },
};

export const THEME_NAMES: Record<string, string> = {
  derby: "Derby",
  bluegrass: "Bluegrass",
  river: "River",
  bourbon: "Bourbon",
  lilac: "Lilac",
  midnight: "Midnight",
};

// accent_color column stores "themeKeyOrHex|headerHex|mono" — any part may be empty/absent
export function parseAccentColor(raw: string | null): { themeKey: string | null; headerColor: string | null; monoSocial: boolean } {
  if (!raw) return { themeKey: null, headerColor: null, monoSocial: false };
  const parts = raw.split("|");
  return {
    themeKey: parts[0] || null,
    headerColor: parts[1] || null,
    monoSocial: parts[2] === "mono",
  };
}

export function buildAccentColor(themeKey: string | null, headerColor: string | null, monoSocial: boolean): string | null {
  if (!themeKey && !headerColor && !monoSocial) return null;
  if (monoSocial) return `${themeKey ?? ""}|${headerColor ?? ""}|mono`;
  if (!headerColor) return themeKey;
  return `${themeKey ?? ""}|${headerColor}`;
}

export const HEADER_COLOR_PRESETS: Array<{ name: string; color: string | null }> = [
  { name: "Auto", color: null },
  { name: "Black", color: "#111111" },
  { name: "Red", color: "#c8102e" },
  { name: "Blue", color: "#1a4fd6" },
  { name: "Purple", color: "#6b20e0" },
];

export const CATEGORY_LABELS: Record<string, string> = {
  music: "Music",
  "visual-art": "Visual Art",
  food: "Food & Drink",
  retail: "Retail",
  community: "Community",
};
