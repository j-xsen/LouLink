// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------

import { useEffect } from "react";

export function useSeo({ title, noindex = false }: { title: string; noindex?: boolean }) {
  useEffect(() => {
    document.title = title;
    const existing = document.querySelector('meta[name="robots"]');
    if (noindex) {
      if (existing) {
        existing.setAttribute("content", "noindex");
      } else {
        const meta = document.createElement("meta");
        meta.name = "robots";
        meta.content = "noindex";
        document.head.appendChild(meta);
      }
    } else if (existing) {
      existing.remove();
    }
  }, [title, noindex]);
}
