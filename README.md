# PopupGenix Website

Marketing site for [popupgenix.com](https://popupgenix.com): AI sales agents and custom software.

**Stack:** React 18, Vite, TypeScript, Tailwind, shadcn/ui, framer-motion, React Router, TanStack Query, Supabase.

## Develop

```bash
npm install
cp .env.example .env   # then fill in values
npm run dev            # http://localhost:8080
npm test               # vitest
npm run build          # build + prerender routes + sitemap.xml
```

## Content

- Pages, services, case studies and pricing live in `src/lib/site.ts`. Edit there, not in the page components.
- `npm run build` prerenders every route into `dist/<route>/index.html` with its own title, description and canonical URL, and writes `sitemap.xml` (`scripts/postbuild.mjs`).

## Blog (WordPress)

Posts are written in WordPress.com and read through its public REST API (`src/lib/wordpress.ts`). Publish a post in WordPress and it appears on `/blog` automatically. The site name is set in `SITE.wordpress.site`.

## Newsletter

`NewsletterForm` calls the `subscribe_newsletter` Supabase RPC (migration in `supabase/migrations/`). Subscribers are stored in `newsletter_subscriptions`; sending is not built yet.

## Environment

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |

## Deploy (Cloudflare Pages)

Build command `npm run build`, output directory `dist`. `public/_redirects` provides the SPA fallback and `public/_headers` the security headers. Set the two `VITE_` variables in the Pages project settings.
