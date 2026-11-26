import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import Layout from "@/components/site/Layout";
import Seo from "@/components/Seo";
import { ButtonLink, Container, CtaBand, Eyebrow } from "@/components/site/ui";
import { CASE_STUDIES, SERVICES, SITE } from "@/lib/site";
import NotFound from "@/pages/NotFound";

export default function ServicePage() {
  const { pathname } = useLocation();
  const s = SERVICES.find((x) => x.path === pathname.replace(/\/$/, ""));
  if (!s) return <NotFound />;
  const related = SERVICES.filter((x) => x.slug !== s.slug).slice(0, 3);
  const work = CASE_STUDIES.filter((c) => c.status !== "In development").slice(0, 2);

  return (
    <Layout>
      <Seo
        title={s.metaTitle}
        description={s.metaDescription}
        path={s.path}
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Service",
            name: s.title,
            description: s.metaDescription,
            provider: { "@type": "Organization", name: SITE.name, url: SITE.url },
            areaServed: "Worldwide",
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: s.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          },
        ]}
      />
      <section className="relative overflow-hidden py-20 md:py-28">
        <div className="pointer-events-none absolute inset-0" aria-hidden style={{ background: "radial-gradient(50% 60% at 80% 0%, hsl(var(--primary) / 0.14), transparent 70%)" }} />
        <Container className="relative max-w-4xl">
          <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
            <Link to="/services" className="hover:text-foreground">Services</Link> / <span className="text-foreground">{s.title}</span>
          </nav>
          <Eyebrow>{s.title}</Eyebrow>
          <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-6xl">{s.headline}</h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{s.intro}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/contact">Discuss your project <ArrowRight className="h-4 w-4" /></ButtonLink>
            <ButtonLink to="/pricing" variant="ghost">See pricing</ButtonLink>
          </div>
        </Container>
      </section>

      <section className="border-y border-border bg-secondary/40 py-16">
        <Container className="max-w-4xl">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Who it is for</h2>
          <p className="mt-3 text-xl leading-relaxed">{s.who}</p>
        </Container>
      </section>

      <section className="py-20">
        <Container className="grid gap-12 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold">What you get</h2>
            <ul className="mt-6 space-y-4">
              {s.outcomes.map((o) => (
                <li key={o} className="flex gap-3"><Check className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden /><span className="leading-relaxed">{o}</span></li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-bold">What is included</h2>
            <ul className="mt-6 space-y-4">
              {s.deliverables.map((d) => (
                <li key={d} className="flex gap-3"><Check className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden /><span className="leading-relaxed text-muted-foreground">{d}</span></li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-2" aria-label="Typical technology">
              {s.stack.map((t) => <span key={t} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{t}</span>)}
            </div>
          </div>
        </Container>
      </section>

      <section className="border-t border-border py-20">
        <Container className="max-w-3xl">
          <h2 className="mb-8 text-2xl font-bold">Frequently asked questions</h2>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {s.faqs.map((f) => (
              <details key={f.q} className="group p-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}<span className="text-primary transition group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-t border-border bg-secondary/40 py-16">
        <Container>
          <h2 className="mb-8 text-2xl font-bold">Related work</h2>
          <div className="grid gap-5 md:grid-cols-2">
            {work.map((c) => (
              <Link key={c.slug} to={`/work/${c.slug}`} className="rounded-2xl border border-border bg-card p-6 transition hover:border-primary/40">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">{c.tag}</p>
                <h3 className="mt-2 text-lg font-semibold">{c.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{c.summary}</p>
              </Link>
            ))}
          </div>
          <h2 className="mb-6 mt-14 text-2xl font-bold">Other services</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {related.map((r) => (
              <Link key={r.slug} to={r.path} className="rounded-2xl border border-border bg-card p-5 text-sm transition hover:border-primary/40">
                <span className="font-semibold">{r.title}</span>
                <span className="mt-1 block text-muted-foreground">{r.short}</span>
              </Link>
            ))}
          </div>
        </Container>
      </section>
      <CtaBand />
    </Layout>
  );
}
