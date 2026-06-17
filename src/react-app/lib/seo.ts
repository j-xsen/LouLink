// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------

import { useEffect } from "react";

function upsertMeta(nameAttr: "name" | "property", nameVal: string, content: string) {
  let el = document.querySelector(`meta[${nameAttr}="${nameVal}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(nameAttr, nameVal);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export interface SeoProps {
  title: string;
  description?: string;
  image?: string | null;
  url?: string;
  ogType?: string;
  noindex?: boolean;
}

export function useSeo({ title, description, image, url, ogType = "website", noindex = false }: SeoProps) {
  useEffect(() => {
    document.title = title;

    // Robots
    const robotsMeta = document.querySelector('meta[name="robots"]');
    if (noindex) {
      if (robotsMeta) {
        robotsMeta.setAttribute("content", "noindex");
      } else {
        const m = document.createElement("meta");
        m.name = "robots";
        m.content = "noindex";
        document.head.appendChild(m);
      }
    } else {
      robotsMeta?.remove();
    }

    upsertMeta("property", "og:title", title);
    upsertMeta("name", "twitter:title", title);
    upsertMeta("property", "og:type", ogType);

    if (description) {
      upsertMeta("name", "description", description);
      upsertMeta("property", "og:description", description);
      upsertMeta("name", "twitter:description", description);
    }

    if (url) {
      upsertMeta("property", "og:url", url);
      upsertCanonical(url);
    }

    if (image) {
      upsertMeta("property", "og:image", image);
      upsertMeta("name", "twitter:image", image);
      upsertMeta("name", "twitter:card", "summary");
    }
  }, [title, description, image, url, ogType, noindex]);
}
