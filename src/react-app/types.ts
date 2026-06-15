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
  derby:     { bg: "#fff0f0", card: "#ffffff", text: "#1a0505", label: "#c8102e" },
  bluegrass: { bg: "#f0faf4", card: "#ffffff", text: "#071a0e", label: "#2d7a4a" },
  river:     { bg: "#eff6ff", card: "#ffffff", text: "#0a1a2e", label: "#2563eb" },
  bourbon:   { bg: "#fffbf0", card: "#fef9e7", text: "#2c1a00", label: "#b45309" },
  lilac:     { bg: "#faf5ff", card: "#ffffff", text: "#1e0a3c", label: "#7c3aed" },
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

export const CATEGORY_LABELS: Record<string, string> = {
  music: "Music",
  "visual-art": "Visual Art",
  food: "Food & Drink",
  retail: "Retail",
  community: "Community",
};
