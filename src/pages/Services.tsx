import { Link } from "react-router-dom";
import { ArrowRight, Bot, Brain, Cloud, Code, Globe, Smartphone, Users } from "lucide-react";
import Layout from "@/components/site/Layout";
import Seo from "@/components/Seo";
import { Container, CtaBand, Eyebrow } from "@/components/site/ui";
import { SERVICES, STATIC_ROUTES } from "@/lib/site";

const icons = { bot: Bot, code: Code, globe: Globe, smartphone: Smartphone, users: Users, cloud: Cloud, brain: Brain } as const;
const meta = STATIC_ROUTES.find((r) => r.path === "/services")!;

export default function Services() {
  return (
    <Layout>
      <Seo title={meta.title} description={meta.description} path="/services" />
      <section className="py-20">
        <Container>
          <div className="mb-14 max-w-3xl">
            <Eyebrow>Services</Eyebrow>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">What we build</h1>
            <p className="mt-5 text-lg text-muted-foreground">AI agents, custom software and the automation that connects them. Start with the problem; we will recommend the smallest thing that solves it.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {SERVICES.map((s) => {
              const I = icons[s.icon];
              return (
                <Link key={s.slug} to={s.path} className="group flex flex-col rounded-2xl border border-border bg-card p-8 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-elegant">
                  <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><I className="h-6 w-6" aria-hidden /></span>
                  <h2 className="text-2xl font-semibold">{s.title}</h2>
                  <p className="mt-3 flex-1 leading-relaxed text-muted-foreground">{s.short}</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary">Explore <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden /></span>
                </Link>
              );
            })}
          </div>
        </Container>
      </section>
      <CtaBand />
    </Layout>
  );
}
