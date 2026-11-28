// Runs after `vite build`. Writes one static HTML file per route so search
// engines and AI crawlers (which often do not run JavaScript) get the right
// title, description, canonical URL, structured data and real text.
// React replaces the fallback text as soon as the app loads.
import fs from "node:fs";
import path from "node:path";

const SITE = "https://popupgenix.com";
const dist = path.resolve("dist");
const pages = JSON.parse(fs.readFileSync("src/seo/pages.json", "utf8"));
const base = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const today = new Date().toISOString().slice(0, 10);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

const ORG = {
  "@type": ["Organization", "ProfessionalService"],
  "@id": `${SITE}/#organization`,
  name: "PopupGenix",
  url: `${SITE}/`,
  logo: `${SITE}/logo-512.png`,
  image: `${SITE}/og-image.png`,
  description: "Custom software and AI solutions company building SaaS platforms, CRM and ERP systems, web and mobile apps, and AI tools.",
  email: "hello@popupgenix.com",
  telephone: "+8801838580258",
  address: { "@type": "PostalAddress", streetAddress: "1209 Mountain Road PL NE, Ste R", addressLocality: "Albuquerque", addressRegion: "NM", postalCode: "87110", addressCountry: "US" },
  areaServed: "Worldwide",
  openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "09:00", closes: "18:00" }],
  contactPoint: [{ "@type": "ContactPoint", contactType: "sales", telephone: "+8801838580258", email: "hello@popupgenix.com", availableLanguage: ["English"] }],
  sameAs: ["https://www.linkedin.com/company/popupgenix", "https://x.com/popupgenix7", "https://www.facebook.com/profile.php?id=61577242150254"],
};
const WEBSITE = { "@type": "WebSite", "@id": `${SITE}/#website`, url: `${SITE}/`, name: "PopupGenix", publisher: { "@id": `${SITE}/#organization` }, inLanguage: "en" };

function graph(route, p) {
  const g = [];
  if (route === "/") g.push(ORG, WEBSITE);
  else g.push({ "@type": "Organization", "@id": `${SITE}/#organization`, name: "PopupGenix", url: `${SITE}/` });
  const crumbs = [{ "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` }];
  if (route !== "/") crumbs.push({ "@type": "ListItem", position: 2, name: p.service || p.h1, item: SITE + route });
  g.push({ "@type": "BreadcrumbList", itemListElement: crumbs });
  g.push({ "@type": "WebPage", "@id": `${SITE}${route}#webpage`, url: SITE + route, name: p.title, description: p.description, isPartOf: { "@id": `${SITE}/#website` }, inLanguage: "en" });
  if (p.kind === "service") g.push({ "@type": "Service", name: p.service, description: p.intro, serviceType: p.service, provider: { "@id": `${SITE}/#organization` }, areaServed: "Worldwide", url: SITE + route });
  if (p.faq) g.push({ "@type": "FAQPage", mainEntity: p.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
  return { "@context": "https://schema.org", "@graph": g };
}

const NAV = [["/", "Home"], ["/services/ai-machine-learning", "AI & Machine Learning"], ["/services/custom-software", "Custom Software"], ["/services/web-development", "Web Development"], ["/services/mobile-apps", "Mobile Apps"], ["/services/crm-saas", "CRM & SaaS"], ["/services/cloud-devops", "Cloud & DevOps"], ["/blog", "Blog"], ["/contact", "Contact"]];

function body(route, p) {
  const pts = (p.points || []).map((x) => `<li>${esc(x)}</li>`).join("");
  const faq = (p.faq || []).map(([q, a]) => `<h2>${esc(q)}</h2><p>${esc(a)}</p>`).join("");
  const nav = NAV.map(([h, n]) => `<a href="${h}">${esc(n)}</a>`).join(" · ");
  return `<main id="seo-fallback" style="max-width:760px;margin:0 auto;padding:96px 24px;background:#0D0F0E;color:#EDF2EF;font-family:Inter,Arial,sans-serif;line-height:1.6;min-height:100vh"><h1 style="font-size:2rem;margin:0 0 16px">${esc(p.h1)}</h1><p>${esc(p.intro)}</p>${pts ? `<ul>${pts}</ul>` : ""}${faq}<nav style="margin-top:32px;color:#5FB89A">${nav}</nav></main>`;
}

function render(route, p, extra = {}) {
  const url = SITE + (route === "/" ? "/" : route);
  let h = base;
  const rep = (re, to) => { h = h.replace(re, () => to); };
  rep(/<title>[\s\S]*?<\/title>/, `<title>${esc(p.title)}</title>`);
  rep(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(p.description)}">`);
  rep(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}" />`);
  rep(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(p.title)}" />`);
  rep(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(p.description)}" />`);
  rep(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}" />`);
  rep(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(p.title)}" />\n    <meta name="twitter:description" content="${esc(p.description)}" />\n    <meta name="robots" content="index, follow, max-image-preview:large" />`);
  rep(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, ld(extra.graph || graph(route, p)));
  rep(/<div id="root"><\/div>/, `<div id="root">${extra.body || body(route, p)}</div>`);
  const out = route === "/" ? path.join(dist, "index.html") : path.join(dist, route.slice(1), "index.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, h);
}

const urls = [];
for (const [route, p] of Object.entries(pages)) {
  render(route, p);
  if (p.kind !== "legal" || true) urls.push({ loc: SITE + (route === "/" ? "/" : route), pri: route === "/" ? "1.0" : p.kind === "service" || route === "/contact" ? "0.8" : "0.5" });
}

// Blog posts from WordPress (optional: skipped if the site cannot be reached).
try {
  const WP = process.env.WP_SITE || "shahedalfahad19-xvmtl.wordpress.com";
  const res = await fetch(`https://public-api.wordpress.com/wp/v2/sites/${WP}/posts?per_page=50&_fields=slug,title,excerpt,date,modified`, { signal: AbortSignal.timeout(8000) });
  if (res.ok) {
    const posts = await res.json();
    const strip = (s) => String(s).replace(/<[^>]+>/g, " ").replace(/&#8217;/g, "'").replace(/&amp;/g, "&").replace(/&#\d+;/g, "").replace(/\s+/g, " ").trim();
    for (const post of posts) {
      const title = strip(post.title.rendered);
      const desc = strip(post.excerpt.rendered).slice(0, 155);
      const route = `/blog/${post.slug}`;
      const p = { title: `${title} | PopupGenix`, description: desc, h1: title, intro: desc, points: [], kind: "blog" };
      const g = graph(route, p);
      g["@graph"].push({ "@type": "BlogPosting", headline: title, description: desc, datePublished: post.date, dateModified: post.modified, author: { "@id": `${SITE}/#organization` }, publisher: { "@id": `${SITE}/#organization` }, mainEntityOfPage: SITE + route });
      render(route, p, { graph: g });
      urls.push({ loc: SITE + route, pri: "0.6", mod: String(post.modified).slice(0, 10) });
    }
    console.log(`prerender: ${posts.length} blog posts`);
  }
} catch (e) { console.log("prerender: blog posts skipped:", e.message); }

fs.writeFileSync(path.join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.mod || today}</lastmod><priority>${u.pri}</priority></url>`).join("\n")}\n</urlset>\n`);
console.log(`prerender: ${Object.keys(pages).length} pages, sitemap ${urls.length} urls`);
