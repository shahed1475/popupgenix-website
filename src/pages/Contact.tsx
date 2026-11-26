import { useState } from "react";
import { Loader2, Mail, MapPin, MessageCircle, Phone, CalendarCheck } from "lucide-react";
import Layout from "@/components/site/Layout";
import Seo from "@/components/Seo";
import { Container, Eyebrow } from "@/components/site/ui";
import { supabase } from "@/integrations/supabase/client";
import { SITE, STATIC_ROUTES } from "@/lib/site";

const meta = STATIC_ROUTES.find((r) => r.path === "/contact")!;
const budgets = ["Not sure yet", "Under $1,000", "$1,000 – $5,000", "$5,000 – $15,000", "$15,000+"];
const field = "h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function Contact() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  // The chat assistant hands over here with the visitor's last message pre-filled.
  const prefill = (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("message") : "")?.slice(0, 1000) ?? "";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get("website")) return; // honeypot
    setState("loading");
    const { error } = await supabase.from("contact_submissions").insert({
      name: String(form.get("name") ?? "").slice(0, 200),
      email: String(form.get("email") ?? "").slice(0, 254),
      company: String(form.get("company") ?? "").slice(0, 200) || null,
      budget_range: String(form.get("budget") ?? "") || null,
      subject: "Website enquiry",
      message: String(form.get("message") ?? "").slice(0, 5000),
    });
    if (error) {
      setState("error");
      setErr(`We could not send that. Please email ${SITE.email} directly.`);
    } else {
      setState("done");
    }
  }

  return (
    <Layout>
      <Seo title={meta.title} description={meta.description} path="/contact" />
      <section className="py-20">
        <Container className="grid gap-14 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Eyebrow>Contact</Eyebrow>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Tell us what you are trying to fix</h1>
            <p className="mt-5 text-lg text-muted-foreground">A few lines is plenty. You will hear back from a real person within one business day.</p>
            <ul className="mt-10 space-y-5 text-sm">
              <li className="flex gap-3"><Mail className="h-5 w-5 text-primary" aria-hidden /><a href={`mailto:${SITE.email}`} className="hover:underline">{SITE.email}</a></li>
              <li className="flex gap-3"><Phone className="h-5 w-5 text-primary" aria-hidden /><a href={SITE.phoneHref} className="hover:underline">{SITE.phone}</a></li>
              <li className="flex gap-3"><MessageCircle className="h-5 w-5 text-primary" aria-hidden /><a href={SITE.whatsapp} target="_blank" rel="noopener noreferrer" className="hover:underline">WhatsApp us</a></li>
              <li className="flex gap-3"><MapPin className="h-5 w-5 shrink-0 text-primary" aria-hidden /><span>{SITE.address.street}, {SITE.address.city}, {SITE.address.region} {SITE.address.postal}</span></li>
              {SITE.bookingUrl && (
                <li className="flex gap-3"><CalendarCheck className="h-5 w-5 text-primary" aria-hidden /><a href={SITE.bookingUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">Book a 20-minute call</a></li>
              )}
            </ul>
          </div>

          <div className="lg:col-span-3">
            {state === "done" ? (
              <div role="status" className="rounded-3xl border border-border bg-card p-10 text-center">
                <h2 className="text-2xl font-bold">Thank you, we have your message.</h2>
                <p className="mt-3 text-muted-foreground">We will reply within one business day.</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5 rounded-3xl border border-border bg-card p-8" aria-label="Contact form">
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block text-sm font-medium">Name<input name="name" required maxLength={200} autoComplete="name" className={`mt-2 ${field}`} /></label>
                  <label className="block text-sm font-medium">Email<input name="email" type="email" required maxLength={254} autoComplete="email" className={`mt-2 ${field}`} /></label>
                  <label className="block text-sm font-medium">Company<input name="company" maxLength={200} autoComplete="organization" className={`mt-2 ${field}`} /></label>
                  <label className="block text-sm font-medium">Budget
                    <select name="budget" className={`mt-2 ${field}`} defaultValue="">
                      <option value="">Select a range</option>
                      {budgets.map((b) => <option key={b}>{b}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block text-sm font-medium">How can we help?
                  <textarea name="message" required rows={6} maxLength={5000} defaultValue={prefill} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </label>
                <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
                {state === "error" && <p role="alert" className="text-sm text-destructive">{err}</p>}
                <button type="submit" disabled={state === "loading"} className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-8 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
                  {state === "loading" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Send message
                </button>
              </form>
            )}
          </div>
        </Container>
      </section>
    </Layout>
  );
}
