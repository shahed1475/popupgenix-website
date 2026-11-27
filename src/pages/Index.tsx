import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Brain, Cloud, Code, Globe } from "lucide-react";
import Layout from "@/components/site/Layout";
import Seo, { organizationLd } from "@/components/Seo";
import { ButtonLink, Container, CtaBand, Eyebrow, SectionHeading } from "@/components/site/ui";
import NewsletterForm from "@/components/site/NewsletterForm";
import { CASE_STUDIES, PRICING, PROCESS, SERVICES, SITE, STATIC_ROUTES } from "@/lib/site";

// What we build, grouped for a first-time visitor. Links resolve through SERVICES so a
// renamed or re-pathed service cannot leave a dead link on the home page.
const GROUPS = [
  {
    slug: "ai-automation",
    icon: Brain,
    title: "AI agents and automation",
    body: "Chat agents that answer from your own documents, AI data analysis and predictive reporting, and workflows that connect your CRM, calendar, email and WhatsApp.",
    points: ["Sales and support agents with a human handover", "Document processing and reporting", "A plain rule instead of AI when a rule does the job"],
  },
  {
    slug: "custom-software",
    icon: Code,
    title: "Custom software and SaaS",
    body: "Platforms and internal tools designed around how your business runs, from multi-tenant SaaS to dashboards and client portals.",
    points: ["Roles, billing and audit logs built in", "Existing codebases audited and extended", "You own the code and the accounts"],
  },
  {
    slug: "web-development",
    icon: Globe,
    title: "Web and mobile apps",
    body: "Fast, accessible websites and web apps, plus iOS and Android apps from one codebase.",
    points: ["SEO-ready sites with a blog or CMS", "React Native and Expo for mobile", "App Store and Google Play submission support"],
  },
  {
    slug: "cloud-devops",
    icon: Cloud,
    title: "Cloud and DevOps",
    body: "The infrastructure that keeps what we build running: deployment, monitoring and recovery.",
    points: ["CI/CD pipelines and Docker setups", "Monitoring, alerts and backups", "Cost-aware hosting on Cloudflare, AWS or GCP"],
  },
] as const;

const FAQ = [
  { q: "Is my data safe with an AI system?", a: "Systems are designed around your data policies. Only the minimum data is sent to third-party models, and self-hosted models can be used where required. Specific compliance needs are reviewed on the first call." },
  { q: "Can AI get things wrong?", a: "Yes. Agents are grounded in your own documents, tested against real enquiries before launch, and hand off to a person for anything sensitive. Where a plain rule is more reliable, we use the rule." },
  { q: "Do I need AI at all?", a: "Not always. If a simple script or off-the-shelf tool does the job, we say so. AI is added where it measurably helps." },
  { q: "Who owns the code?", a: "You do. Clients own the source code and the infrastructure accounts it runs on." },
  { q: "How long does a project take?", a: "It depends on the project, so timelines are set in a written scope after a discovery call. A person on the team confirms dates; nothing is promised before then." },
];

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
};

const statusStyle: Record<string, string> = {
  "In development": "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Built: "border-primary/40 bg-primary/10 text-primary",
  Live: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyle[status] ?? statusStyle.Built}`}>
      {status}
    </span>
  );
}

/** Static hero visual: the studio's own products, straight from the case-study data. */
function ProductBoard() {
  return (
    <div className="relative mx-auto w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-elegant" aria-label="Products built by PopupGenix">
      <p className="mb-3 border-b border-border pb-3 text-sm font-semibold">What we have built and are building</p>
      <ul className="divide-y divide-border">
        {CASE_STUDIES.map((c) => (
          <li key={c.slug}>
            <Link to={`/work/${c.slug}`} className="flex items-center justify-between gap-3 py-3 transition hover:text-primary">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{c.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{c.tag}</span>
              </span>
              <StatusBadge status={c.status} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Index() {
  const reduce = useReducedMotion();
  const fade = reduce ? {} : { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.5 } };
  const home = STATIC_ROUTES[0];
  const built = CASE_STUDIES.filter((c) => c.status !== "In development");
  const inDevelopment = CASE_STUDIES.filter((c) => c.status === "In development");

  return (
    <Layout>
      <Seo
        title={home.title}
        description={home.description}
        path="/"
        jsonLd={[organizationLd, { "@context": "https://schema.org", "@type": "WebSite", name: SITE.name, url: SITE.url }, faqLd]}
      />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden
          style={{ background: "radial-gradient(50% 60% at 75% 10%, hsl(var(--primary) / 0.16), transparent 70%), radial-gradient(40% 50% at 10% 0%, hsl(var(--primary) / 0.08), transparent 70%)" }} />
        <Container className="relative grid items-center gap-14 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <Eyebrow>AI products and custom software</Eyebrow>
            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              We build AI products and the software around them.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              PopupGenix is a founder-led studio in {SITE.address.city}, {SITE.address.region}. We build AI agents, data and predictive-analytics products, SaaS platforms, web and mobile apps, and the automation that connects them.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink to="/contact">Talk about your project <ArrowRight className="h-4 w-4" /></ButtonLink>
              <ButtonLink to="/work" variant="ghost">See what we&apos;ve built</ButtonLink>
            </div>
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-border pt-6">
              <div><dt className="text-xs text-muted-foreground">Founded</dt><dd className="mt-1 text-2xl font-bold">{SITE.founded}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Products built</dt><dd className="mt-1 text-2xl font-bold">{built.length}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Based in</dt><dd className="mt-1 text-2xl font-bold">{SITE.address.city}</dd></div>
            </dl>
          </div>
          <ProductBoard />
        </Container>
      </section>

      {/* What we build */}
      <section className="border-y border-border bg-secondary/40 py-24">
        <Container>
          <SectionHeading eyebrow="What we build" title="AI where it helps, solid software everywhere else" body="One small team for the model, the product around it and the infrastructure under it." />
          <div className="grid gap-5 md:grid-cols-2">
            {GROUPS.map(({ slug, icon: I, title, body, points }) => {
              const service = SERVICES.find((s) => s.slug === slug);
              return (
                <motion.div key={slug} {...fade}>
                  <Link to={service?.path ?? "/services"} className="group flex h-full flex-col rounded-2xl border border-border bg-card p-7 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-elegant">
                    <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><I className="h-5 w-5" aria-hidden /></span>
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                    <ul className="mt-4 flex-1 space-y-1.5 text-sm text-muted-foreground">
                      {points.map((p) => (
                        <li key={p} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />{p}</li>
                      ))}
                    </ul>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">Learn more <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden /></span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Also offered: <Link to="/services" className="font-medium text-primary">CRMs, client portals and lead-management systems</Link>. Not sure which fits? <Link to="/contact" className="font-medium text-primary">Describe the problem</Link> and we will say honestly whether you need us.
          </p>
        </Container>
      </section>

      {/* Products */}
      <section className="py-24">
        <Container>
          <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <SectionHeading eyebrow="Products" title="We build our own products, and we build for others" />
            <Link to="/work" className="mb-12 inline-flex items-center gap-1.5 text-sm font-medium text-primary">All work <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {built.map((c) => (
              <Link key={c.slug} to={`/work/${c.slug}`} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-elegant">
                {c.image ? (
                  <img src={c.image} alt={`${c.name} screenshot`} loading="lazy" width={800} height={500} className="aspect-[16/10] w-full object-cover object-top" />
                ) : (
                  <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-primary/20 to-secondary text-3xl font-bold" aria-hidden>{c.name}</div>
                )}
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">{c.tag}</p>
                    <StatusBadge status={c.status} />
                  </div>
                  <h3 className="mt-2 text-xl font-semibold">{c.name}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{c.summary}</p>
                </div>
              </Link>
            ))}
          </div>
          {inDevelopment.length > 0 && (
            <div className="mt-10">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">In development, not yet public</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {inDevelopment.map((c) => (
                  <Link key={c.slug} to={`/work/${c.slug}`} className="rounded-2xl border border-dashed border-border bg-card/50 p-5 transition hover:border-primary/40">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{c.name}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.summary}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Container>
      </section>

      {/* Process */}
      <section className="border-y border-border bg-secondary/40 py-24">
        <Container>
          <SectionHeading eyebrow="How we work" title="A clear process, with no surprises" body="Written scope up front, weekly updates, and code you own." />
          <ol className="grid gap-5 md:grid-cols-5">
            {PROCESS.map((p) => (
              <li key={p.step} className="rounded-2xl border border-border bg-card p-6">
                <span className="text-sm font-semibold text-primary">{p.step}</span>
                <h3 className="mt-3 text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Engagement */}
      <section className="py-24">
        <Container>
          <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <SectionHeading eyebrow="Working together" title="Three ways to engage" body="Only the Starter price is published. Projects and larger platforms are quoted after a short call." />
            <Link to="/pricing" className="mb-12 inline-flex items-center gap-1.5 text-sm font-medium text-primary">Pricing details <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {PRICING.map((p) => (
              <div key={p.name} className="rounded-2xl border border-border bg-card p-7">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="mt-2 text-2xl font-bold">{p.price} <span className="text-sm font-normal text-muted-foreground">{p.cadence}</span></p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.blurb}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Founder-led */}
      <section className="border-t border-border bg-secondary/40 py-20">
        <Container className="max-w-3xl text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Founder-led, deliberately small</h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            PopupGenix was founded in {SITE.founded} by Abdullah Al Fahad, who still leads every project. You talk to the person building your product, and nothing gets lost in hand-offs.
          </p>
          <Link to="/about" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">About the studio <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </Container>
      </section>

      {/* Questions */}
      <section className="py-24">
        <Container className="max-w-3xl">
          <SectionHeading eyebrow="Questions" title="Common questions about AI work" />
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span className="text-primary transition group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      {/* Newsletter */}
      <section className="pb-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Get practical notes on AI and software</h2>
            <p className="mt-3 text-muted-foreground">Short, useful emails when we publish something worth your time.</p>
            <div className="mx-auto mt-6 max-w-md text-left"><NewsletterForm source="home" /></div>
          </div>
        </Container>
      </section>

      <CtaBand />
    </Layout>
  );
}
