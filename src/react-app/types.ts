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
  bluegrass: { bg: "#8ecfaa", card: "#ffffff", text: "#071a0e", label: "#1a6635" },
  river:     { bg: "#8ab8e8", card: "#ffffff", text: "#081428", label: "#1a4fd6" },
  bourbon:   { bg: "#f5a030", card: "#fffdf0", text: "#2c1800", label: "#8a4500" },
  midnight:  { bg: "#0f1629", card: "#1a2744", text: "#e2eaf8", label: "#93b4f0" },
  mono:      { bg: "#f0f0f0", card: "#ffffff", text: "#111111", label: "#111111" },
  terminal:  { bg: "#0a0e08", card: "#111a0f", text: "#39ff14", label: "#39ff14" },
};

export const THEME_NAMES: Record<string, string> = {
  bluegrass: "Bluegrass",
  river: "River",
  bourbon: "Bourbon",
  midnight: "Midnight",
  mono: "Mono",
  terminal: "Terminal",
};

export const AVATAR_SHAPES = ["circle", "A", "B", "C"] as const;
export type AvatarShape = typeof AVATAR_SHAPES[number];

// accent_color column stores "themeKeyOrHex|headerHex|mono|shape" — any part may be empty/absent
export function parseAccentColor(raw: string | null): { themeKey: string | null; headerColor: string | null; monoSocial: boolean; avatarShape: AvatarShape } {
  if (!raw) return { themeKey: null, headerColor: null, monoSocial: false, avatarShape: "circle" };
  const parts = raw.split("|");
  const shapePart = parts[3] ?? "";
  return {
    themeKey: parts[0] || null,
    headerColor: parts[1] || null,
    monoSocial: parts[2] === "mono",
    avatarShape: (AVATAR_SHAPES as readonly string[]).includes(shapePart) ? shapePart as AvatarShape : "circle",
  };
}

export function buildAccentColor(themeKey: string | null, headerColor: string | null, monoSocial: boolean, avatarShape: AvatarShape = "circle"): string | null {
  const monoPart = monoSocial ? "mono" : "";
  const shapePart = avatarShape !== "circle" ? avatarShape : "";
  if (!themeKey && !headerColor && !monoPart && !shapePart) return null;
  if (shapePart) return `${themeKey ?? ""}|${headerColor ?? ""}|${monoPart}|${shapePart}`;
  if (monoPart) return `${themeKey ?? ""}|${headerColor ?? ""}|${monoPart}`;
  if (headerColor) return `${themeKey ?? ""}|${headerColor}`;
  return themeKey;
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
