import { Link } from "react-router-dom";
import { Github, Linkedin, Mail, MapPin, Phone, Twitter } from "lucide-react";
import { SERVICES, SITE } from "@/lib/site";
import NewsletterForm from "@/components/site/NewsletterForm";

const company = [
  { name: "Work", href: "/work" },
  { name: "Process", href: "/process" },
  { name: "About", href: "/about" },
  { name: "Pricing", href: "/pricing" },
  { name: "Blog", href: "/blog" },
  { name: "Contact", href: "/contact" },
];

const legal = [
  { name: "Privacy Policy", href: "/privacy" },
  { name: "Terms & Conditions", href: "/terms-and-conditions" },
  { name: "Refund Policy", href: "/refund-policy" },
  { name: "Cookie Policy", href: "/cookie-policy" },
];

const socials = [
  { icon: Linkedin, href: SITE.social.linkedin, label: "LinkedIn" },
  { icon: Twitter, href: SITE.social.x, label: "X" },
  { icon: Github, href: SITE.social.github, label: "GitHub" },
];

const colHead = "mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-foreground";
const linkCls = "text-sm text-muted-foreground transition-colors hover:text-foreground";

const Footer = () => (
  <footer className="border-t border-border bg-background">
    <div className="mx-auto max-w-7xl px-6 lg:px-12">
      <div className="grid gap-12 py-16 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Link to="/" className="flex items-center gap-2.5" aria-label="PopupGenix home">
            <img src="/popupgenix-logo.svg" alt="" className="h-8 w-8" width={32} height={32} />
            <span className="text-lg font-bold tracking-tight">PopupGenix</span>
          </Link>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {SITE.tagline}. Founder-led, based in Albuquerque, NM, working with clients worldwide.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-primary" aria-hidden />
              <a href={`mailto:${SITE.email}`} className={linkCls}>{SITE.email}</a>
            </li>
            <li className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-primary" aria-hidden />
              <a href={SITE.phoneHref} className={linkCls}>{SITE.phone}</a>
            </li>
            <li className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span className="text-muted-foreground">
                {SITE.address.street}, {SITE.address.city}, {SITE.address.region} {SITE.address.postal}
              </span>
            </li>
          </ul>
        </div>

        <nav aria-label="Services" className="lg:col-span-2">
          <h3 className={colHead}>Services</h3>
          <ul className="space-y-3">
            {SERVICES.map((s) => (
              <li key={s.slug}>
                <Link to={s.path} className={linkCls}>{s.title}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Company" className="lg:col-span-2">
          <h3 className={colHead}>Company</h3>
          <ul className="space-y-3">
            {company.map((l) => (
              <li key={l.href}>
                <Link to={l.href} className={linkCls}>{l.name}</Link>
              </li>
            ))}
            <li>
              <Link to="/portal" className={linkCls}>Client portal</Link>
            </li>
          </ul>
        </nav>

        <div className="lg:col-span-4">
          <h3 className={colHead}>Newsletter</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Practical notes on AI agents, automation and building software.
          </p>
          <NewsletterForm source="footer" compact />
        </div>
      </div>

      <div className="flex flex-col items-center justify-between gap-4 border-t border-border py-6 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} PopupGenix. All rights reserved.
        </p>
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          {legal.map((l) => (
            <li key={l.href}>
              <Link to={l.href} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
                {l.name}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          {socials.map(({ icon: Icon, href, label }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Icon className="h-4 w-4" />
            </a>
          ))}
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
