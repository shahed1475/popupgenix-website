/**
 * PopupGenix chat agent — Cloudflare Worker.
 *
 * POST /api/chat   { sessionId, messages }  -> text/event-stream
 * GET  /api/health                          -> { ok: true }
 *
 * The Anthropic key lives as a Worker secret and never reaches the browser.
 */

import { SYSTEM_PROMPT } from "./knowledge";

export interface Env {
  ANTHROPIC_API_KEY: string;
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  MODEL?: string;
}

// Exact matches from ALLOWED_ORIGINS, plus Cloudflare Pages preview deployments
// of this project (https://<hash-or-branch>.popupgenix-website.pages.dev).
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.popupgenix-website\.pages\.dev$/;
function originAllowed(origin: string, env: Env): boolean {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  return allowed.includes(origin) || PREVIEW_ORIGIN.test(origin);
}

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY = 24;
const RATE_LIMIT_PER_HOUR = 40;
const MAX_TOOL_ROUNDS = 3;

const LEAD_TOOL = {
  name: "capture_lead",
  description:
    "Record a website visitor who wants the PopupGenix team to contact them. " +
    "Call this once per conversation, only when the visitor has shown real " +
    "intent and you have their name plus an email or phone number.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: { type: "string", description: "The visitor's name, as they gave it." },
      email: { type: "string", description: "Email address, if given." },
      phone: { type: "string", description: "Phone or WhatsApp number, if given." },
      company: { type: "string", description: "Company or organisation, if mentioned." },
      project: {
        type: "string",
        description:
          "What they want built, in one or two sentences, in your own words.",
      },
      budget: {
        type: "string",
        description: "Budget, only if the visitor volunteered one. Never ask for it.",
      },
      service: {
        type: "string",
        enum: [
          "ai-machine-learning",
          "custom-software",
          "web-development",
          "mobile-apps",
          "crm-saas",
          "cloud-devops",
          "other",
        ],
        description: "Closest matching PopupGenix service line.",
      },
    },
    required: ["name", "project"],
  },
};

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  const ok = origin && originAllowed(origin, env);
  return {
    "Access-Control-Allow-Origin": ok ? origin! : allowed[0] ?? "",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

/** Crude but effective: count this IP's messages in the last hour. */
async function overRateLimit(env: Env, ip: string): Promise<boolean> {
  const since = Date.now() - 60 * 60 * 1000;
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM chat_messages WHERE ip = ? AND created_at > ? AND role = 'user'"
  )
    .bind(ip, since)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= RATE_LIMIT_PER_HOUR;
}

async function logMessage(
  env: Env,
  sessionId: string,
  ip: string,
  role: string,
  content: string
) {
  await env.DB.prepare(
    "INSERT INTO chat_messages (session_id, ip, role, content, created_at) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(sessionId, ip, role, content.slice(0, 8000), Date.now())
    .run();
}

async function saveLead(
  env: Env,
  sessionId: string,
  ip: string,
  input: Record<string, unknown>
): Promise<string> {
  const existing = await env.DB.prepare(
    "SELECT id FROM chat_leads WHERE session_id = ?"
  )
    .bind(sessionId)
    .first<{ id: number }>();

  if (existing) {
    return "A lead was already recorded for this conversation. Do not call this tool again; just continue helping the visitor.";
  }

  await env.DB.prepare(
    `INSERT INTO chat_leads
       (session_id, ip, name, email, phone, company, project, budget, service, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      sessionId,
      ip,
      String(input.name ?? "").slice(0, 200),
      String(input.email ?? "").slice(0, 200),
      String(input.phone ?? "").slice(0, 60),
      String(input.company ?? "").slice(0, 200),
      String(input.project ?? "").slice(0, 2000),
      String(input.budget ?? "").slice(0, 100),
      String(input.service ?? "other").slice(0, 40),
      Date.now()
    )
    .run();

  return "Lead recorded. Tell the visitor the team has their details and give them the direct email, phone and WhatsApp so they are not left waiting.";
}

interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true }, 200, cors);
    }

    if (url.pathname !== "/api/chat" || request.method !== "POST") {
      return json({ error: "Not found" }, 404, cors);
    }

    if (!origin || !originAllowed(origin, env)) {
      return json({ error: "Origin not allowed" }, 403, cors);
    }

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

    let body: { sessionId?: string; messages?: { role: string; content: string }[] };
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }

    const sessionId = String(body.sessionId ?? "").slice(0, 64);
    const incoming = Array.isArray(body.messages) ? body.messages : [];

    if (!sessionId || incoming.length === 0) {
      return json({ error: "sessionId and messages are required" }, 400, cors);
    }

    const history = incoming
      .slice(-MAX_HISTORY)
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({
        role: m.role as "user" | "assistant",
        // Only the visitor's own input is length-capped; clipping our previous
        // replies would silently drop context the model needs.
        content:
          m.role === "user"
            ? String(m.content ?? "").slice(0, MAX_MESSAGE_CHARS)
            : String(m.content ?? ""),
      }))
      .filter((m) => m.content.length > 0);

    if (history.length === 0 || history[history.length - 1].role !== "user") {
      return json({ error: "Last message must be from the user" }, 400, cors);
    }

    if (await overRateLimit(env, ip)) {
      return json(
        {
          error:
            "You have hit the message limit for this hour. Email hello@popupgenix.com and the team will pick it up directly.",
        },
        429,
        cors
      );
    }

    await logMessage(env, sessionId, ip, "user", history[history.length - 1].content);

    const model = env.MODEL ?? "claude-sonnet-5-5";
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        const conversation: { role: "user" | "assistant"; content: unknown }[] = [
          ...history,
        ];
        let fullReply = "";

        try {
          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const res = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": env.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model,
                max_tokens: 1024,
                system: SYSTEM_PROMPT,
                tools: [LEAD_TOOL],
                messages: conversation,
                stream: true,
              }),
            });

            if (!res.ok || !res.body) {
              const detail = await res.text().catch(() => "");
              console.error("Anthropic error", res.status, detail.slice(0, 500));
              send("error", {
                message:
                  "I can't reach my brain right now. Email hello@popupgenix.com or WhatsApp +8801838580258 and the team will help you directly.",
              });
              return; // `finally` closes the controller
            }

            const blocks: AnthropicBlock[] = [];
            const partialJson: Record<number, string> = {};
            let stopReason: string | null = null;

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });

              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const payload = line.slice(6).trim();
                if (!payload || payload === "[DONE]") continue;

                let evt: Record<string, unknown>;
                try {
                  evt = JSON.parse(payload);
                } catch {
                  continue;
                }

                const type = evt.type as string;

                if (type === "content_block_start") {
                  const idx = evt.index as number;
                  blocks[idx] = { ...(evt.content_block as AnthropicBlock) };
                  if (blocks[idx].type === "tool_use") partialJson[idx] = "";
                } else if (type === "content_block_delta") {
                  const idx = evt.index as number;
                  const delta = evt.delta as Record<string, unknown>;
                  if (delta.type === "text_delta") {
                    const text = delta.text as string;
                    blocks[idx] = blocks[idx] ?? { type: "text", text: "" };
                    blocks[idx].text = (blocks[idx].text ?? "") + text;
                    fullReply += text;
                    send("delta", { text });
                  } else if (delta.type === "input_json_delta") {
                    partialJson[idx] = (partialJson[idx] ?? "") + (delta.partial_json as string);
                  }
                } else if (type === "content_block_stop") {
                  const idx = evt.index as number;
                  if (blocks[idx]?.type === "tool_use") {
                    try {
                      blocks[idx].input = JSON.parse(partialJson[idx] || "{}");
                    } catch {
                      blocks[idx].input = {};
                    }
                  }
                } else if (type === "message_delta") {
                  const delta = evt.delta as Record<string, unknown>;
                  if (delta.stop_reason) stopReason = delta.stop_reason as string;
                }
              }
            }

            const toolUses = blocks.filter((b) => b && b.type === "tool_use");

            if (stopReason !== "tool_use" || toolUses.length === 0) {
              break;
            }

            send("status", { message: "Passing your details to the team…" });

            // The Messages API rejects empty text blocks, which would 400 the
            // continuation and surface as a generic failure to the visitor.
            conversation.push({
              role: "assistant",
              content: blocks.filter(
                (b) => b && (b.type !== "text" || (b.text ?? "").trim().length > 0)
              ),
            });

            const results = [];
            for (const tool of toolUses) {
              let text = "Unknown tool.";
              if (tool.name === "capture_lead") {
                try {
                  text = await saveLead(
                    env,
                    sessionId,
                    ip,
                    (tool.input ?? {}) as Record<string, unknown>
                  );
                } catch (err) {
                  console.error("saveLead failed", err);
                  text =
                    "Saving failed. Apologise briefly and give the visitor the direct email and WhatsApp instead.";
                }
              }
              results.push({
                type: "tool_result",
                tool_use_id: tool.id,
                content: text,
              });
            }

            conversation.push({ role: "user", content: results });
          }

          if (!fullReply.trim()) {
            // Either the tool-round budget ran out mid-call, or the turn was
            // tool-use only. Never leave the visitor staring at a blank bubble.
            const fallback =
              "I've passed what I have to the team. For anything urgent, email hello@popupgenix.com, call +1 479 689 1012, or WhatsApp +8801838580258.";
            send("delta", { text: fallback });
            fullReply = fallback;
          }
          await logMessage(env, sessionId, ip, "assistant", fullReply);
          send("done", {});
        } catch (err) {
          console.error("stream failed", err);
          send("error", {
            message:
              "Something broke on my side. Email hello@popupgenix.com or WhatsApp +8801838580258 and the team will pick it up.",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...cors,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  },
};
