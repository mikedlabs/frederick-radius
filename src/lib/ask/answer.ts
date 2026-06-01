import "server-only";
import { search } from "@/lib/search";

/**
 * "Ask Frederick" — the grounded concierge brain.
 *
 * Hard rule (the product's whole trust premise): the model may ONLY use
 * the places/events we retrieve and hand it. It is told never to invent a
 * place, address, hour, price, or fact, and to say plainly when the data
 * doesn't hold the answer. We also return the real retrieved places as
 * `sources` so the UI renders clickable, verifiable cards alongside the
 * prose — the answer is anchored to real records, not vibes.
 *
 * Provider-flexible: uses ANTHROPIC_API_KEY (the proven claude-haiku path
 * already in this repo) if present, else OPENAI_API_KEY via the Vercel AI
 * SDK. With neither set it returns { configured: false } and the UI shows
 * a "coming soon" state — no errors, no fabrication.
 */

export type AskSource = {
  slug: string;
  name: string;
  category: string;
  city?: string;
  href: string;
};
export type AskResult = {
  configured: boolean;
  answer: string | null;
  sources: AskSource[];
};

const SYSTEM = `You are the Frederick Radius concierge — a sharp, warm local guide to Frederick County, Maryland.
Answer the user's question using ONLY the FREDERICK DATA provided in the message.

Rules you must follow:
- NEVER invent a place, address, hour, price, rating, or fact. Use only what's in the data.
- If the data doesn't answer the question, say so plainly in one sentence and suggest searching or checking the map — do not guess.
- Keep it tight: 2–4 sentences, then name your top 1–3 specific picks from the data.
- Sound like a knowledgeable local, not a chatbot. No "as an AI", no filler, no markdown headers.`;

function hasKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}

async function callModel(userContent: string): Promise<string | null> {
  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (anthropic) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": anthropic,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 400,
          system: SYSTEM,
          messages: [{ role: "user", content: userContent }],
        }),
      });
      if (res.ok) {
        const j = (await res.json()) as { content?: Array<{ text?: string }> };
        const t = j?.content?.[0]?.text;
        if (t) return String(t).trim();
      }
    } catch {
      /* fall through to OpenAI */
    }
  }
  if (process.env.OPENAI_API_KEY) {
    try {
      const { generateText } = await import("ai");
      const { openai } = await import("@ai-sdk/openai");
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        system: SYSTEM,
        prompt: userContent,
      });
      if (text) return text.trim();
    } catch {
      /* fall through to null */
    }
  }
  return null;
}

export async function askFrederick(query: string): Promise<AskResult> {
  const q = (query || "").trim();
  if (!q) return { configured: hasKey(), answer: null, sources: [] };

  const hits = search(q, 18);
  const lines: string[] = [];
  const sources: AskSource[] = [];

  for (const h of hits) {
    if (lines.length >= 14) break;
    if (h.type === "place") {
      const p = h.place as {
        slug: string;
        name: string;
        category: string;
        city?: string;
        municipality?: string;
        short_blurb?: string;
      };
      const where = p.city || p.municipality || "";
      const blurb = (p.short_blurb || "").slice(0, 90);
      lines.push(
        `${lines.length + 1}. ${p.name} — ${p.category}${where ? `, ${where}` : ""}${blurb ? ` — ${blurb}` : ""}`,
      );
      if (sources.length < 6)
        sources.push({ slug: p.slug, name: p.name, category: p.category, city: where, href: `/places/${p.slug}` });
    } else if (h.type === "event") {
      const e = h.event as { title: string; starts_at?: string; venue_name?: string };
      const when = e.starts_at
        ? new Date(e.starts_at).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })
        : "";
      lines.push(`${lines.length + 1}. EVENT: ${e.title}${when ? ` (${when})` : ""}${e.venue_name ? ` @ ${e.venue_name}` : ""}`);
    }
  }

  const dataBlock =
    lines.length > 0
      ? lines.join("\n")
      : "(no matching places or events were found in the Frederick catalog)";
  const userContent = `The user asked: "${q}"\n\nFREDERICK DATA (the only facts you may use):\n${dataBlock}\n\nAnswer using only this data.`;

  const answer = await callModel(userContent);
  return { configured: answer !== null || hasKey(), answer, sources };
}
