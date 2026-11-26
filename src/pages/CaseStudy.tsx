import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, ExternalLink } from "lucide-react";
import Layout from "@/components/site/Layout";
import Seo from "@/components/Seo";
import { ButtonLink, Container, CtaBand } from "@/components/site/ui";
import { CASE_STUDIES, getCaseStudy } from "@/lib/site";
import NotFound from "@/pages/NotFound";

export default function CaseStudy() {
  const { slug = "" } = useParams();
  const c = getCaseStudy(slug);
  if (!c) return <NotFound />;
  const next = CASE_STUDIES[(CASE_STUDIES.findIndex((x) => x.slug === c.slug) + 1) % CASE_STUDIES.length];

  return (
    <Layout>
      <Seo title={`${c.name}: ${c.tag} Case Study`} description={c.metaDescription} path={`/work/${c.slug}`} image={c.image ? `https://popupgenix.com${c.image}` : undefined} />
      <article className="py-16 md:py-24">
        <Container className="max-w-4xl">
          <Link to="/work" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden /> All work</Link>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{c.tag} · {c.status}</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-6xl">{c.name}</h1>
          <p className="mt-5 text-xl leading-relaxed text-muted-foreground">{c.summary}</p>
          {c.url && (
            <div className="mt-7"><ButtonLink to={c.url} external>Visit live site <ExternalLink className="h-4 w-4" /></ButtonLink></div>
          )}
          {c.image && <img src={c.image} alt={`${c.name} screenshot`} width={1200} height={750} className="mt-12 w-full rounded-2xl border border-border" />}

          <div className="mt-14 grid gap-10 md:grid-cols-2">
            <section><h2 className="text-xl font-bold">The problem</h2><p className="mt-3 leading-relaxed text-muted-foreground">{c.problem}</p></section>
            <section><h2 className="text-xl font-bold">What we built</h2><p className="mt-3 leading-relaxed text-muted-foreground">{c.solution}</p></section>
          </div>

          <section className="mt-12">
            <h2 className="text-xl font-bold">Highlights</h2>
            <ul className="mt-5 grid gap-3 md:grid-cols-2">
              {c.highlights.map((h) => (
                <li key={h} className="flex gap-3 rounded-xl border border-border bg-card p-4"><Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /><span className="text-sm leading-relaxed">{h}</span></li>
              ))}
            </ul>
          </section>

          <section className="mt-12">
            <h2 className="text-xl font-bold">Built with</h2>
            <div className="mt-4 flex flex-wrap gap-2">{c.stack.map((t) => <span key={t} className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">{t}</span>)}</div>
          </section>

          <Link to={`/work/${next.slug}`} className="mt-16 flex items-center justify-between rounded-2xl border border-border bg-card p-6 transition hover:border-primary/40">
            <span><span className="block text-xs text-muted-foreground">Next case study</span><span className="text-lg font-semibold">{next.name}</span></span>
            <ArrowRight className="h-5 w-5 text-primary" aria-hidden />
          </Link>
        </Container>
      </article>
      <CtaBand />
    </Layout>
  );
}
