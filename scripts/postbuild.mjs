// Runs after `vite build`. Bakes per-route <title>, description, canonical and Open Graph tags into
// static HTML (so crawlers and link previews see them without running JavaScript), and writes
// sitemap.xml. Blog posts are pulled from the WordPress.com public API at build time.
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const out = join(tmpdir(), `site-${process.pid}.mjs`);
await build({ entryPoints: [join(root, "src/lib/site.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
const { SITE, allRoutes } = await import(pathToFileURL(out).href);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const strip = (html) => html.replace(/<[^>]*>/g, "").replace(/&#8217;/g, "'").replace(/&#8211;/g, "-").replace(/&hellip;|\[&hellip;\]/g, "…").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

let routes = allRoutes().map((r) => ({ ...r }));

try {
  const res = await fetch(`${SITE.wordpress.api}/posts?per_page=100&_fields=slug,title,excerpt,modified`, { signal: AbortSignal.timeout(15000) });
  if (res.ok) {
    const posts = await res.json();
    for (const p of posts) {
      routes.push({ path: `/blog/${p.slug}`, title: strip(p.title.rendered), description: strip(p.excerpt.rendered).slice(0, 160), priority: 0.6, lastmod: p.modified?.slice(0, 10), article: true });
    }
    console.log(`postbuild: ${posts.length} WordPress posts included`);
  } else console.warn(`postbuild: WordPress returned ${res.status}; blog posts skipped`);
} catch (e) {
  console.warn(`postbuild: WordPress unreachable (${e.message}); blog posts skipped`);
}

const template = await readFile(join(dist, "index.html"), "utf8");

function render(r) {
  const title = r.title.includes(SITE.name) ? r.title : `${r.title} | ${SITE.name}`;
  const url = `${SITE.url}${r.path === "/" ? "/" : r.path}`;
  let html = template
    .replace(/<title>.*?<\/title>/s, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(r.description)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(r.description)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`);
  if (r.article) html = html.replace('<meta property="og:type" content="website" />', '<meta property="og:type" content="article" />');
  if (r.noindex) html = html.replace("</head>", '<meta name="robots" content="noindex, nofollow" />\n  </head>');
  return html;
}

for (const r of routes) {
  if (r.path === "/") {
    await writeFile(join(dist, "index.html"), render(r));
    continue;
  }
  const dir = join(dist, r.path);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), render(r));
}

const today = new Date().toISOString().slice(0, 10);
const urls = routes
  .filter((r) => !r.noindex)
  .map((r) => `  <url><loc>${SITE.url}${r.path === "/" ? "/" : r.path}</loc><lastmod>${r.lastmod ?? today}</lastmod><priority>${(r.priority ?? 0.5).toFixed(1)}</priority></url>`)
  .join("\n");
await writeFile(join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
console.log(`postbuild: prerendered ${routes.length} routes, sitemap.xml written`);
