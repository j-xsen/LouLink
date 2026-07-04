// ---------------------------------------------------------------------------
// Draft — localStorage buffer for the page builder
// ---------------------------------------------------------------------------

import type { Draft, DraftLink } from "../types";

const DRAFT_KEY = "loulink_draft";
const EMPTY_DRAFT: Draft = { items: [] };

// Pre-migration drafts stored links without a kind discriminator.
type StoredDraft = Draft & { links?: Omit<DraftLink, "kind">[] };

export function getDraft(): Draft {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as StoredDraft | null;
    if (!raw) return EMPTY_DRAFT;
    // Migrate old format: { links: [...] } → { items: [...] }
    if (Array.isArray(raw.links) && !raw.items) {
      return { items: raw.links.map((l) => ({ kind: "link" as const, ...l })) };
    }
    return raw ?? EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

export function saveDraft(d: Partial<Draft>) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...getDraft(), ...d }));
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}
