import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import pages from "@/seo/pages.json";

const SITE = "https://popupgenix.com";
const BRAND = "PopupGenix";

// Per-page title and description for search engines and link previews.
// Wording follows the text already on each page. Blog pages set their own.
const PAGES: Record<string, { title: string; description: string }> = {
  ...(pages as Record<string, { title: string; description: string }>),
  "/portal": { title: "Client Portal | PopupGenix", description: "Sign in to the PopupGenix client portal." },
};

function setMeta(selector: string, attr: "name" | "property", key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

export function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname.startsWith("/blog")) return; // blog pages manage their own meta
    const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
    const page = PAGES[path];
    const isPrivate = path.startsWith("/admin") || path.startsWith("/portal");
    const title = page?.title ?? `Page not found | ${BRAND}`;
    const description = page?.description ?? PAGES["/"].description;

    try {
      document.title = title;
      setMeta('meta[name="description"]', "name", "description", description);
      setMeta('meta[property="og:title"]', "property", "og:title", title);
      setMeta('meta[property="og:description"]', "property", "og:description", description);
      setMeta('meta[property="og:url"]', "property", "og:url", SITE + path);
      setMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
      // Unknown pages and private areas should not be indexed.
      setMeta('meta[name="robots"]', "name", "robots", page && !isPrivate ? "index, follow" : "noindex, nofollow");

      let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = SITE + path;
    } catch {
      // Meta tags are only for search engines; never let them break the page.
    }
  }, [pathname]);

  return null;
}
