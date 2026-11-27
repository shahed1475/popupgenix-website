import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE = "https://popupgenix.com";
const BRAND = "PopupGenix";

// Per-page title and description for search engines and link previews.
// Wording follows the text already on each page. Blog pages set their own.
const PAGES: Record<string, { title: string; description: string }> = {
  "/": {
    title: "PopupGenix | AI & Custom Software Solutions",
    description:
      "PopupGenix builds custom software, SaaS platforms, CRM and ERP systems, web and mobile apps, and AI/ML solutions that help businesses grow.",
  },
  "/contact": {
    title: "Contact PopupGenix | Start Your Project",
    description: "Talk to PopupGenix about your software, AI, web or mobile project. Email, WhatsApp or call us.",
  },
  "/pricing": {
    title: "Pricing | PopupGenix",
    description: "Pricing and engagement options for custom software, AI, web and mobile projects with PopupGenix.",
  },
  "/services/ai-machine-learning": {
    title: "AI & Machine Learning Services | PopupGenix",
    description: "AI solutions including NLP, computer vision, predictive analytics and AI security systems.",
  },
  "/services/custom-software": {
    title: "Custom Software Development | PopupGenix",
    description: "Custom enterprise software: ERP systems, CRM solutions, SaaS platforms and business automation tools.",
  },
  "/services/web-development": {
    title: "Web Development | PopupGenix",
    description: "Modern web applications, from corporate websites to e-commerce platforms and progressive web apps.",
  },
  "/services/mobile-apps": {
    title: "Mobile App Development | PopupGenix",
    description: "Native and cross-platform mobile apps for iOS and Android, including AI-powered apps.",
  },
  "/services/crm-saas": {
    title: "CRM & SaaS Tools | PopupGenix",
    description: "CRM systems and SaaS tools with sales automation, customer analytics and AI dashboards.",
  },
  "/services/cloud-devops": {
    title: "Cloud & DevOps Services | PopupGenix",
    description: "Cloud migration, CI/CD pipelines, Kubernetes and scalable infrastructure.",
  },
  "/privacy": { title: "Privacy Policy | PopupGenix", description: "How PopupGenix collects, uses and protects your information." },
  "/terms-and-conditions": { title: "Terms and Conditions | PopupGenix", description: "Terms and conditions for using PopupGenix services." },
  "/refund-policy": { title: "Refund Policy | PopupGenix", description: "PopupGenix refund policy for projects and services." },
  "/cookie-policy": { title: "Cookie Policy | PopupGenix", description: "How PopupGenix uses cookies on this website." },
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
  }, [pathname]);

  return null;
}
