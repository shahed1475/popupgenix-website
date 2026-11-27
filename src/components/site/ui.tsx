import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
      {children}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  center = false,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  center?: boolean;
}) {
  return (
    <div className={`mb-12 max-w-3xl ${center ? "mx-auto text-center" : ""}`}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="text-3xl font-bold tracking-tight md:text-5xl">{title}</h2>
      {body && <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{body}</p>}
    </div>
  );
}

export const Container = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`mx-auto max-w-7xl px-6 lg:px-12 ${className}`}>{children}</div>
);

export function ButtonLink({
  to,
  children,
  variant = "primary",
  external,
}: {
  to: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
  external?: boolean;
}) {
  const cls =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:opacity-90"
      : "border border-border text-foreground hover:bg-secondary";
  const base = `inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold transition ${cls}`;
  if (external) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className={base}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={base}>
      {children}
    </Link>
  );
}

export function CtaBand({
  title = "Have something to build with AI or custom software?",
  body = "Tell us what you are trying to fix. We reply within one business day with honest next steps, even if the answer is that you do not need us.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section className="py-20">
      <Container>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-8 py-14 text-center md:px-16 md:py-20">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(60% 80% at 50% 0%, hsl(var(--primary) / 0.18), transparent 70%)",
            }}
            aria-hidden
          />
          <div className="relative">
            <h2 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight md:text-5xl">{title}</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{body}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink to="/contact">
                Start a project <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink to="/work" variant="ghost">See our work</ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
