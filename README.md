# PopupGenix Website

The marketing website and client portal for PopupGenix, a custom software and AI automation company. Built with React, TypeScript and Supabase.

## What is on the site

- Service pages: web development, mobile apps, AI and ML, custom software, CRM and SaaS, cloud and DevOps
- Pricing, contact form, blog and individual blog posts
- A client portal and an admin panel backed by Supabase
- Cookie, privacy, terms and refund policy pages
- Animated landing experience with Framer Motion and a Spline 3D scene

## Backend

Supabase provides the database, authentication and edge functions. The functions send notifications for new messages, client replies and client updates. Schema changes live in `supabase/migrations`.

## Tech stack

React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Framer Motion, React Query, React Router, Supabase, Vitest.

## Run it locally

```
cp .env.example .env
npm install
npm run dev
npm test
```

Add your Supabase project URL and public (anon) key to `.env`. Never commit real secrets.

## Deployment

The repo includes a Dockerfile with an nginx config for container hosting, and a `.cpanel.yml` for cPanel deployment. `SECURITY_FIX_REPORT.md` records the security review and fixes.
