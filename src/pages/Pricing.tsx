import { Check } from "lucide-react";
import Layout from "@/components/site/Layout";
import Seo from "@/components/Seo";
import { ButtonLink, Container, CtaBand, Eyebrow } from "@/components/site/ui";
import { PRICING, STATIC_ROUTES } from "@/lib/site";

const meta = STATIC_ROUTES.find((r) => r.path === "/pricing")!;
const faqs = [
  ["How do fixed-scope projects work?", "We agree a written scope and quote after a discovery call. You approve it before any build work starts."],
  ["What does the monthly plan cover?", "A set amount of development and automation work each month, planned together. Unused hours do not turn into surprise invoices."],
  ["Do I own what you build?", "Yes. You own the source code and the accounts it runs on."],
  ["How do I pay?", "We invoice by milestone or monthly. Card and bank-transfer options are available."],
];

export default function Pricing() {
  return (
    <Layout>
      <Seo title={meta.title} description={meta.description} path="/pricing" />
      <section className="py-20">
        <Container>
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <Eyebrow>Pricing</Eyebrow>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">Simple, transparent engagement models</h1>
            <p className="mt-5 text-lg text-muted-foreground">Pick the model that fits how you work. Every engagement starts with a free discovery call.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {PRICING.map((p) => (
              <div key={p.name} className={`flex flex-col rounded-3xl border p-8 ${p.featured ? "border-primary bg-card shadow-elegant" : "border-border bg-card"}`}>
                {p.featured && <span className="mb-4 w-fit rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">Most popular</span>}
                <h2 className="text-xl font-semibold">{p.name}</h2>
                <p className="mt-4"><span className="text-4xl font-bold">{p.price}</span> <span className="text-sm text-muted-foreground">{p.cadence}</span></p>
                <p className="mt-3 text-sm text-muted-foreground">{p.blurb}</p>
                <ul className="mt-6 flex-1 space-y-3">
                  {p.features.map((f) => <li key={f} className="flex gap-3 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{f}</li>)}
                </ul>
                <div className="mt-8"><ButtonLink to="/contact" variant={p.featured ? "primary" : "ghost"}>{p.cta}</ButtonLink></div>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-20 max-w-3xl">
            <h2 className="mb-6 text-2xl font-bold">Pricing questions</h2>
            <div className="divide-y divide-border rounded-2xl border border-border bg-card">
              {faqs.map(([q, a]) => (
                <details key={q} className="group p-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">{q}<span className="text-primary transition group-open:rotate-45" aria-hidden>+</span></summary>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </Container>
      </section>
      <CtaBand />
    </Layout>
  );
}
