// ---------------------------------------------------------------------------
// Draft — localStorage buffer for the page builder
// ---------------------------------------------------------------------------

import type { Draft } from "../types";

const DRAFT_KEY = "loulink_draft";
const EMPTY_DRAFT: Draft = { items: [] };

export function getDraft(): Draft {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (!raw) return EMPTY_DRAFT;
    // Migrate old format: { links: [...] } → { items: [...] }
    if (Array.isArray(raw.links) && !raw.items) {
      return { items: raw.links.map((l: any) => ({ kind: "link" as const, ...l })) };
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
