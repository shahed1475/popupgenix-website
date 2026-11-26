import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { subscribeToNewsletter } from "@/lib/newsletter";

export default function NewsletterForm({ source = "website", compact = false }: { source?: string; compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    const res = await subscribeToNewsletter(email, source);
    if (res.ok) {
      setState("done");
      setMessage("You are subscribed. Thank you.");
      setEmail("");
    } else {
      setState("error");
      setMessage(res.message ?? "Something went wrong. Please try again.");
    }
  }

  if (state === "done") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Check className="h-4 w-4 text-primary" aria-hidden /> {message}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full" noValidate>
      <label htmlFor={`nl-${source}`} className="sr-only">Email address</label>
      <div className={`flex gap-2 ${compact ? "flex-col sm:flex-row" : "flex-col sm:flex-row"}`}>
        <input
          id={`nl-${source}`}
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={state === "error"}
          aria-describedby={state === "error" ? `nl-err-${source}` : undefined}
          className="h-11 min-w-0 flex-1 rounded-full border border-input bg-background px-5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Subscribe <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {state === "error" && (
        <p id={`nl-err-${source}`} role="alert" className="mt-2 text-sm text-destructive">{message}</p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">One email when we publish something useful. Unsubscribe any time.</p>
    </form>
  );
}
