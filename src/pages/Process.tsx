import Layout from "@/components/site/Layout";
import Seo from "@/components/Seo";
import { Container, CtaBand, Eyebrow } from "@/components/site/ui";
import { PROCESS, STATIC_ROUTES } from "@/lib/site";

const meta = STATIC_ROUTES.find((r) => r.path === "/process")!;

export default function Process() {
  return (
    <Layout>
      <Seo title={meta.title} description={meta.description} path="/process" />
      <section className="py-20">
        <Container className="max-w-4xl">
          <Eyebrow>Process</Eyebrow>
          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">How we work</h1>
          <p className="mt-5 text-lg text-muted-foreground">Five steps, a written scope up front and weekly updates, so you always know where things stand and what comes next.</p>
          <ol className="mt-14 space-y-6">
            {PROCESS.map((p) => (
              <li key={p.step} className="flex gap-6 rounded-2xl border border-border bg-card p-7">
                <span className="text-3xl font-bold text-primary">{p.step}</span>
                <div><h2 className="text-xl font-semibold">{p.title}</h2><p className="mt-2 leading-relaxed text-muted-foreground">{p.body}</p></div>
              </li>
            ))}
          </ol>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              ["You own the code", "Source code and infrastructure accounts are yours from day one."],
              ["Written scope", "No vague estimates. You approve a scope before we build."],
              ["Honest advice", "If a simpler or cheaper option works, we will tell you."],
            ].map(([t, b]) => (
              <div key={t} className="rounded-2xl border border-border p-6"><h3 className="font-semibold">{t}</h3><p className="mt-2 text-sm text-muted-foreground">{b}</p></div>
            ))}
          </div>
        </Container>
      </section>
      <CtaBand />
    </Layout>
  );
}
