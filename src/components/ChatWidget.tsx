import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { MessageCircle, X, ArrowRight } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

// The chat Worker address is public (it is not a secret). It is built in as the
// default so a missing build variable can never break the chat on the live site.
const API_URL: string =
  import.meta.env.VITE_CHAT_API_URL || "https://popupgenix-chat.abdullah-al-fahad.workers.dev";

const OPENER =
  "Hi, I'm Genix. Ask me anything about what PopupGenix builds, or tell me what you have in mind and I'll pass it to the team.";

const FALLBACK_CONTACT =
  "I couldn't reach the team's server. Email hello@popupgenix.com or WhatsApp +8801838580258 and someone will pick it up.";

const SUGGESTIONS = [
  "What do you build?",
  "How much does a CRM cost?",
  "I want to talk to someone",
];

interface Msg {
  role: "user" | "assistant";
  content: string;
}

function newSessionId(): string {
  const existing = sessionStorage.getItem("pgx-chat-session");
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem("pgx-chat-session", id);
  return id;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: OPENER },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const sessionId = useRef<string>("");
  const messagesRef = useRef<Msg[]>(messages);
  messagesRef.current = messages;
  // Guards against two sends landing in the same React batch: `busy` is read
  // from a stale closure, a ref is not.
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const pinned = useRef(true);

  useEffect(() => {
    sessionId.current = newSessionId();
  }, []);

  // Only follow the stream if the reader is already at the bottom — otherwise
  // scrolling up to re-read fights a scrollTo on every token.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  useEffect(() => {
    if (!pinned.current) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy, status]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  const close = useCallback(() => {
    abortRef.current?.abort();
    setOpen(false);
    launcherRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Abort any live stream if the widget unmounts mid-reply.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || inFlight.current) return;

    if (!API_URL) {
      setMessages((m) => [
        ...m,
        { role: "user", content: trimmed },
        {
          role: "assistant",
          content:
            "The chat service isn't configured yet. Email hello@popupgenix.com or WhatsApp +8801838580258 and the team will help you directly.",
        },
      ]);
      setInput("");
      return;
    }

    inFlight.current = true;
    setInput("");
    setBusy(true);
    setStatus(null);
    pinned.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    // Append through the updater so a stale `messages` closure cannot drop a
    // turn, and remember where our placeholder landed instead of assuming last.
    // The history is built from a ref, not inside the state updater: React runs
    // updaters later, so reading a variable set there gave an empty history and
    // the Worker rejected the request.
    const history: Msg[] = [...messagesRef.current, { role: "user", content: trimmed }];
    const slot = history.length;
    messagesRef.current = [...history, { role: "assistant", content: "" }];
    setMessages(messagesRef.current);

    const writeSlot = (content: string) =>
      setMessages((m) => {
        if (slot < 0 || slot >= m.length) return m;
        const copy = [...m];
        copy[slot] = { role: "assistant", content };
        return copy;
      });

    let received = "";

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: sessionId.current,
          // The opener is ours, not the model's — don't send it back.
          messages: history.slice(1).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? "Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event: "));
          const dataLine = lines.find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.slice(7).trim();
          let data: { text?: string; message?: string };
          try {
            data = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }

          if (event === "delta" && data.text) {
            setStatus(null);
            received += data.text;
            writeSlot(received);
          } else if (event === "status" && data.message) {
            setStatus(data.message);
          } else if (event === "error") {
            setStatus(null);
            received = data.message ?? FALLBACK_CONTACT;
            writeSlot(received);
          }
        }
      }

      // A stream that ends having said nothing would leave an empty bubble.
      if (!received.trim()) writeSlot(FALLBACK_CONTACT);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      const message =
        err instanceof Error && err.message !== "Request failed"
          ? err.message
          : FALLBACK_CONTACT;
      writeSlot(message);
    } finally {
      inFlight.current = false;
      abortRef.current = null;
      setBusy(false);
      setStatus(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? "Close chat" : "Chat with PopupGenix"}
        aria-haspopup="dialog"
        aria-controls="pgx-chat-panel"
        className="press fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elegant transition-transform duration-200 hover:scale-105"
        style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open && (
        <div
          id="pgx-chat-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Chat with PopupGenix"
          className="fixed bottom-24 right-6 z-50 chat-panel flex w-[min(380px,calc(100vw-3rem))] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-elegant animate-slide-up"
        >
          <div className="flex items-center gap-3 bg-primary px-5 py-4">
            <BrandMark className="h-5 w-5 text-primary-foreground" />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-primary-foreground">Genix</span>
              <span className="text-[11px] text-primary-foreground/90">
                PopupGenix assistant
              </span>
            </div>
          </div>

          <div
            ref={scrollRef}
            onScroll={onScroll}
            aria-live="polite"
            aria-atomic="false"
            className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground"
                    : "max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-secondary px-4 py-2.5 text-sm leading-relaxed text-foreground"
                }
              >
                {m.content || (busy && i === messages.length - 1 ? "…" : "")}
              </div>
            ))}

            {status && (
              <div className="px-1 text-xs italic text-muted-foreground">{status}</div>
            )}

            {messages.length === 1 && !busy && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy}
                    onClick={() => void send(s)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={onSubmit}
            className="flex items-end gap-2 border-t border-border px-3 py-3"
          >
            <label htmlFor="pgx-chat-input" className="sr-only">
              Your message
            </label>
            <textarea
              id="pgx-chat-input"
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={2000}
              placeholder="Ask about your project…"
              className="max-h-28 flex-1 resize-none rounded-lg bg-transparent px-2 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send message"
              className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
