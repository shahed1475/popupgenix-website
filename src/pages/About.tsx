import Layout from "@/components/site/Layout";
import Seo from "@/components/Seo";
import { ButtonLink, Container, CtaBand, Eyebrow } from "@/components/site/ui";
import { SITE, STATIC_ROUTES } from "@/lib/site";

const meta = STATIC_ROUTES.find((r) => r.path === "/about")!;

export default function About() {
  return (
    <Layout>
      <Seo title={meta.title} description={meta.description} path="/about" />
      <section className="py-20">
        <Container className="max-w-4xl">
          <Eyebrow>About</Eyebrow>
          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">A small studio that ships real products</h1>
          <div className="mt-8 space-y-5 text-lg leading-relaxed text-muted-foreground">
            <p>PopupGenix was founded in {SITE.founded} by Abdullah Al Fahad, who still leads every project. We build AI products, custom software and the automation around them for growing businesses, from our base in {SITE.address.city}, {SITE.address.region}.</p>
            <p>We are deliberately small. You talk to the person building your product, decisions are quick, and nothing gets lost in hand-offs. We also build and run our own products, which keeps our advice grounded in what actually works in production.</p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              ["Founder-led", "Direct access to the person designing and building your product."],
              ["Product mindset", "We ship and operate our own platforms, not just client projects."],
              ["Plain language", "Clear scopes, honest trade-offs and no jargon for its own sake."],
            ].map(([t, b]) => (
              <div key={t} className="rounded-2xl border border-border bg-card p-6"><h2 className="font-semibold">{t}</h2><p className="mt-2 text-sm text-muted-foreground">{b}</p></div>
            ))}
          </div>

          <div className="mt-14 rounded-2xl border border-border bg-card p-8">
            <h2 className="text-xl font-semibold">Where to find us</h2>
            <address className="mt-3 not-italic leading-relaxed text-muted-foreground">
              {SITE.address.street}<br />{SITE.address.city}, {SITE.address.region} {SITE.address.postal}, USA<br />
              <a className="text-primary" href={`mailto:${SITE.email}`}>{SITE.email}</a> · <a className="text-primary" href={SITE.phoneHref}>{SITE.phone}</a>
            </address>
            <div className="mt-6"><ButtonLink to="/contact">Start a conversation</ButtonLink></div>
          </div>
        </Container>
      </section>
      <CtaBand />
    </Layout>
  );
}
