import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Bot, Brain, Cloud, Code, Globe, Smartphone, Users, MessageSquare, CalendarCheck, Sparkles } from "lucide-react";
import Layout from "@/components/site/Layout";
import Seo, { organizationLd } from "@/components/Seo";
import { ButtonLink, Container, CtaBand, Eyebrow, SectionHeading } from "@/components/site/ui";
import NewsletterForm from "@/components/site/NewsletterForm";
import { CASE_STUDIES, PROCESS, SERVICES, SITE, STATIC_ROUTES } from "@/lib/site";

const icons = { bot: Bot, code: Code, globe: Globe, smartphone: Smartphone, users: Users, cloud: Cloud, brain: Brain } as const;

function AgentPreview() {
  const lines = [
    { who: "lead", text: "Hi, do you build custom CRMs? We need something for a 12-person team." },
    { who: "agent", text: "Yes, we do. Roughly how many leads a month, and which tools do you use today?" },
    { who: "lead", text: "About 300, mostly from email and a spreadsheet." },
    { who: "agent", text: "That is a good fit. I can book a 20-minute call with our founder. Does Thursday at 2pm work?" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-elegant" aria-label="Example AI sales agent conversation">
      <div className="mb-4 flex items-center gap-3 border-b border-border pb-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary"><Bot className="h-5 w-5" aria-hidden /></span>
        <div>
          <p className="text-sm font-semibold leading-none">Sales agent</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />Replies in seconds</p>
        </div>
      </div>
      <div className="space-y-3">
        {lines.map((l, i) => (
          <div key={i} className={`flex ${l.who === "lead" ? "justify-end" : "justify-start"}`}>
            <p className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${l.who === "lead" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
              {l.text}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
        <CalendarCheck className="h-4 w-4 text-primary" aria-hidden /> Meeting booked and lead summary sent to CRM
      </div>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">Illustrative example</p>
    </div>
  );
}

export default function Index() {
  const reduce = useReducedMotion();
  const fade = reduce ? {} : { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.5 } };
  const home = STATIC_ROUTES[0];
  const featured = CASE_STUDIES.slice(0, 3);

  return (
    <Layout>
      <Seo
        title={home.title}
        description={home.description}
        path="/"
        jsonLd={[organizationLd, { "@context": "https://schema.org", "@type": "WebSite", name: SITE.name, url: SITE.url }]}
      />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden
          style={{ background: "radial-gradient(50% 60% at 75% 10%, hsl(var(--primary) / 0.16), transparent 70%), radial-gradient(40% 50% at 10% 0%, hsl(var(--primary) / 0.08), transparent 70%)" }} />
        <Container className="relative grid items-center gap-14 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <Eyebrow>AI sales agents and custom software</Eyebrow>
            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              Never lose a lead to a slow reply again.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              PopupGenix builds AI sales agents, custom software and automation that answer enquiries instantly, qualify the right customers and book the meeting, while your team focuses on closing.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink to="/contact">Book a discovery call <ArrowRight className="h-4 w-4" /></ButtonLink>
              <ButtonLink to="/work" variant="ghost">See our work</ButtonLink>
            </div>
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-border pt-6">
              <div><dt className="text-xs text-muted-foreground">Founded</dt><dd className="mt-1 text-2xl font-bold">{SITE.founded}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Products built</dt><dd className="mt-1 text-2xl font-bold">{CASE_STUDIES.filter((c) => c.status !== "In development").length}</dd></div>
              <div><dt className="text-xs text-muted-foreground">We reply within</dt><dd className="mt-1 text-2xl font-bold">1 day</dd></div>
            </dl>
          </div>
          <AgentPreview />
        </Container>
      </section>

      {/* Problem / value */}
      <section className="border-y border-border bg-secondary/40 py-20">
        <Container>
          <SectionHeading eyebrow="What changes" title="Faster replies, cleaner pipeline, less busywork" center />
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: MessageSquare, t: "Instant first response", b: "Every enquiry gets a helpful reply in seconds, on your website, WhatsApp or phone, at any hour." },
              { icon: Sparkles, t: "Qualified, summarised leads", b: "The agent asks your qualifying questions and passes your team a short summary, not a raw transcript." },
              { icon: CalendarCheck, t: "Meetings on the calendar", b: "Good fits are booked straight into your calendar and logged in your CRM." },
            ].map(({ icon: I, t, b }) => (
              <motion.div key={t} {...fade} className="rounded-2xl border border-border bg-card p-7">
                <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><I className="h-5 w-5" aria-hidden /></span>
                <h3 className="text-lg font-semibold">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b}</p>
              </motion.div>
            ))}
          </div>
        </Container>
      </section>

      {/* Services */}
      <section className="py-24">
        <Container>
          <SectionHeading eyebrow="Services" title="One studio for the agent, the software and the automation behind it" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => {
              const I = icons[s.icon];
              return (
                <motion.div key={s.slug} {...fade}>
                  <Link to={s.path} className="group flex h-full flex-col rounded-2xl border border-border bg-card p-7 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-elegant">
                    <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><I className="h-5 w-5" aria-hidden /></span>
                    <h3 className="text-lg font-semibold">{s.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{s.short}</p>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">Learn more <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden /></span>
                  </Link>
                </motion.div>
              );
            })}
            <motion.div {...fade} className="sm:col-span-2 lg:col-span-2">
              <Link to="/contact" className="group flex h-full flex-col justify-center rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-7 transition hover:border-primary hover:bg-primary/10">
                <h3 className="text-lg font-semibold">Not sure which one you need?</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Describe the problem in a few lines. We will tell you honestly whether an agent, custom software or plain automation is the right fix, even if the answer is that you do not need us.</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">Talk to us <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden /></span>
              </Link>
            </motion.div>
          </div>
        </Container>
      </section>

      {/* Work */}
      <section className="border-t border-border py-24">
        <Container>
          <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <SectionHeading eyebrow="Selected work" title="Products we have designed and built" />
            <Link to="/work" className="mb-12 inline-flex items-center gap-1.5 text-sm font-medium text-primary">All work <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {featured.map((c) => (
              <Link key={c.slug} to={`/work/${c.slug}`} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-elegant">
                {c.image ? (
                  <img src={c.image} alt={`${c.name} screenshot`} loading="lazy" width={800} height={500} className="aspect-[16/10] w-full object-cover object-top" />
                ) : (
                  <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-primary/20 to-secondary text-3xl font-bold" aria-hidden>{c.name}</div>
                )}
                <div className="flex flex-1 flex-col p-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">{c.tag}</p>
                  <h3 className="mt-2 text-xl font-semibold">{c.name}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{c.summary}</p>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* Process */}
      <section className="border-t border-border bg-secondary/40 py-24">
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

      {/* Newsletter */}
      <section className="py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Get practical notes on AI agents and automation</h2>
            <p className="mt-3 text-muted-foreground">Short, useful emails when we publish something worth your time.</p>
            <div className="mx-auto mt-6 max-w-md text-left"><NewsletterForm source="home" /></div>
          </div>
        </Container>
      </section>

      <CtaBand />
    </Layout>
  );
}
