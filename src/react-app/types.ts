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

export const CATEGORY_LABELS: Record<string, string> = {
  music: "Music",
  "visual-art": "Visual Art",
  food: "Food & Drink",
  retail: "Retail",
  community: "Community",
};
