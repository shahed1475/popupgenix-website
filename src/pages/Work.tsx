import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Layout from "@/components/site/Layout";
import Seo from "@/components/Seo";
import { Container, CtaBand, Eyebrow } from "@/components/site/ui";
import { CASE_STUDIES, STATIC_ROUTES } from "@/lib/site";

const meta = STATIC_ROUTES.find((r) => r.path === "/work")!;
const badge = { Live: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", Built: "bg-primary/15 text-primary", "In development": "bg-amber-500/15 text-amber-600 dark:text-amber-400" } as const;

export default function Work() {
  return (
    <Layout>
      <Seo title={meta.title} description={meta.description} path="/work" />
      <section className="py-20">
        <Container>
          <div className="mb-14 max-w-3xl">
            <Eyebrow>Work</Eyebrow>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">Products we have built</h1>
            <p className="mt-5 text-lg text-muted-foreground">A mix of client platforms, AI products and our own tools. Each one links to what it does, how it is built and where it stands today.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {CASE_STUDIES.map((c) => (
              <Link key={c.slug} to={`/work/${c.slug}`} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-elegant">
                {c.image ? (
                  <img src={c.image} alt={`${c.name} screenshot`} loading="lazy" width={800} height={500} className="aspect-[16/9] w-full object-cover object-top" />
                ) : (
                  <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-primary/25 to-secondary text-3xl font-bold" aria-hidden>{c.name}</div>
                )}
                <div className="flex flex-1 flex-col p-7">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary">{c.tag}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${badge[c.status]}`}>{c.status}</span>
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold">{c.name}</h2>
                  <p className="mt-2 flex-1 leading-relaxed text-muted-foreground">{c.summary}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">View case study <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden /></span>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </section>
      <CtaBand />
    </Layout>
  );
}
