import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Send, X } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string; handoff?: boolean };
const GREETING: Msg = {
  role: "assistant",
  content: "Hi, I'm the PopupGenix assistant. Tell me what you are trying to build or fix and I'll point you in the right direction.",
};

// Optional bot protection. Set VITE_TURNSTILE_SITE_KEY at build time and TURNSTILE_SECRET on the function.
const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  execute(id: string): void;
  reset(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const tsBox = useRef<HTMLDivElement>(null);
  const tsId = useRef<string | null>(null);
  const tsResolve = useRef<((t: string) => void) | null>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, open]);

  // Load and render Turnstile once, the first time the panel opens.
  useEffect(() => {
    if (!open || !TURNSTILE_KEY || tsId.current) return;
    const mount = () => {
      if (!window.turnstile || !tsBox.current || tsId.current) return;
      tsId.current = window.turnstile.render(tsBox.current, {
        sitekey: TURNSTILE_KEY,
        execution: "execute",
        appearance: "interaction-only",
        callback: (t: string) => tsResolve.current?.(t),
      });
    };
    if (window.turnstile) return mount();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = mount;
    document.head.appendChild(s);
  }, [open]);

  const getToken = useCallback(
    () =>
      new Promise<string>((resolve, reject) => {
        if (!TURNSTILE_KEY) return resolve("");
        if (!window.turnstile || !tsId.current) return reject(new Error("turnstile"));
        const timer = setTimeout(() => reject(new Error("turnstile timeout")), 15000);
        tsResolve.current = (t) => { clearTimeout(timer); resolve(t); };
        window.turnstile.reset(tsId.current);
        window.turnstile.execute(tsId.current);
      }),
    [],
  );

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || busy) return;
    const next = [...msgs, { role: "user" as const, content }];
    setMsgs(next); setText(""); setBusy(true); setFailed(false);
    try {
      const turnstileToken = await getToken();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Only role and content go to the server; the greeting is not part of the conversation.
        body: JSON.stringify({ messages: next.slice(1).map(({ role, content }) => ({ role, content })), turnstileToken }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { reply: string; handoff?: boolean };
      setMsgs([...next, { role: "assistant", content: data.reply, handoff: !!data.handoff }]);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
  const handoffHref = `/contact?message=${encodeURIComponent(lastUser.slice(0, 500))}`;

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div role="dialog" aria-label="Chat with PopupGenix" className="mb-3 flex h-[28rem] w-[calc(100vw-2.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-elegant">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold">PopupGenix assistant</p>
              <p className="text-xs text-muted-foreground">AI assistant. A human replies to quotes.</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-md p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex flex-col items-start gap-2"}>
                <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 leading-relaxed ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>{m.content}</p>
                {m.handoff && i === msgs.length - 1 && (
                  <Link to={handoffHref} className="rounded-full border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10">
                    Share your details with the team
                  </Link>
                )}
              </div>
            ))}
            {busy && <p className="text-xs text-muted-foreground">Typing…</p>}
            {failed && (
              <p className="rounded-xl bg-secondary px-3.5 py-2 text-xs text-muted-foreground">
                The assistant is unavailable right now. <Link to="/contact" className="font-medium text-primary underline">Use the contact form</Link> or email hello@popupgenix.com.
              </p>
            )}
            <div ref={end} />
          </div>
          <div ref={tsBox} />
          <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Ask about AI agents, pricing…" aria-label="Your message" className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" /></button>
          </form>
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Close chat" : "Open chat"} aria-expanded={open} className="ml-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elegant transition hover:scale-105">
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </div>
  );
}
