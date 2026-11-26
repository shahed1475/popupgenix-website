import DOMPurify from "dompurify";
import { SITE } from "@/lib/site";

export interface WPPost {
  id: number;
  slug: string;
  date: string;
  modified: string;
  link: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string };
  jetpack_featured_media_url?: string;
  _embedded?: {
    "wp:featuredmedia"?: { source_url: string; alt_text?: string }[];
    "wp:term"?: { id: number; name: string; slug: string; taxonomy: string }[][];
    author?: { name: string }[];
  };
}

async function wp<T>(path: string): Promise<T> {
  const res = await fetch(`${SITE.wordpress.api}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`WordPress request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export const listPosts = (perPage = 12, page = 1) =>
  wp<WPPost[]>(`/posts?per_page=${perPage}&page=${page}&_embed=1&_fields=id,slug,date,modified,link,title,excerpt,jetpack_featured_media_url,_embedded`);

export async function getPost(slug: string): Promise<WPPost | null> {
  const rows = await wp<WPPost[]>(`/posts?slug=${encodeURIComponent(slug)}&_embed=1`);
  return rows[0] ?? null;
}

/** Strip scripts, iframes with unknown origins and event handlers from WordPress HTML. */
export function cleanHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "loading"],
    FORBID_TAGS: ["style", "script", "form"],
  });
}

export const textOnly = (html: string) =>
  DOMPurify.sanitize(html, { ALLOWED_TAGS: [] }).replace(/&hellip;|\[…\]|\[&hellip;\]/g, "…").trim();

export const readingMinutes = (html: string) =>
  Math.max(1, Math.round(textOnly(html).split(/\s+/).length / 220));

export const featuredImage = (p: WPPost) =>
  p._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? p.jetpack_featured_media_url ?? null;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
