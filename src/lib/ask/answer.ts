import "server-only";
import { search } from "@/lib/search";
import { matchCivicAction } from "@/data/civic-actions";
import { matchDepartment } from "@/data/department-contacts";

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
 * Provider-flexible, in priority order:
 *   1. AI_GATEWAY_API_KEY — the Vercel AI Gateway (recommended): one key,
 *      a model-agnostic "provider/model" string, built-in observability +
 *      fallbacks. This is the key to set on Vercel.
 *   2. ANTHROPIC_API_KEY — direct Claude Haiku (the proven path here).
 *   3. OPENAI_API_KEY — direct GPT-4o-mini via the AI SDK.
 * With none set it returns { configured: false } and the UI degrades to the
 * retrieved place cards (never a dead end) — no errors, no fabrication.
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
  return Boolean(
    // VERCEL_OIDC_TOKEN: the Vercel AI Gateway's KEYLESS auth, injected
    // automatically into deployments when the Gateway is enabled. Enabling
    // the Gateway (the recommended setup) is enough — no raw key needed —
    // so the marquee Ask feature stops reading "not configured" when the
    // owner turned the Gateway on rather than pasting an explicit key.
    process.env.AI_GATEWAY_API_KEY ||
      process.env.VERCEL_OIDC_TOKEN ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY,
  );
}

async function callModel(userContent: string): Promise<string | null> {
  // 1) Vercel AI Gateway — the preferred path. A plain "provider/model"
  // string routes through the gateway, authenticated by AI_GATEWAY_API_KEY
  // if set, else the keyless VERCEL_OIDC_TOKEN that Vercel injects when the
  // Gateway is enabled. One toggle, swap models without a code change. If
  // the model slug ever drifts, this throws and we fall through.
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) {
    try {
      const { generateText } = await import("ai");
      const { text } = await generateText({
        model: "anthropic/claude-haiku-4.5",
        system: SYSTEM,
        prompt: userContent,
        // ai-gw-3: bound the primary Ask path like the fallbacks (raw
        // Anthropic caps max_tokens:400, the planner 200). The system prompt
        // asks for 2-4 sentences, so 400 is ample; a low temperature keeps the
        // local-expert voice consistent and the output near-deterministic.
        maxOutputTokens: 400,
        temperature: 0.3,
      });
      if (text) return text.trim();
    } catch {
      /* fall through to a direct provider */
    }
  }

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

  // Civic intent grounding: if the question is a "how do I…" (register to
  // vote, report a pothole, pay a bill, permits…), surface the county's
  // AUTHORITATIVE link so the model cites a real action, never an invented
  // one. Listed first so it leads the answer when relevant.
  const civic = matchCivicAction(q);
  if (civic) {
    sources.push({ slug: civic.id, name: civic.label, category: "civic", city: "", href: civic.url });
  }
  const civicLine = civic
    ? `OFFICIAL CIVIC ACTION (cite this link if relevant): ${civic.label} → ${civic.url}\n`
    : "";

  // Department grounding: "number for animal control / parks & rec" →
  // the real phone + address, never invented.
  const dept = matchDepartment(q);
  if (dept) {
    sources.push({ slug: `dept-${dept.slug}`, name: dept.name, category: "civic", city: "", href: dept.url });
  }
  const deptLine = dept
    ? `OFFICIAL DEPARTMENT CONTACT (cite if relevant): ${dept.name}${dept.phone ? ` — ${dept.phone}` : ""}${dept.address ? ` — ${dept.address}` : ""}\n`
    : "";

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
  const userContent = `The user asked: "${q}"\n\nFREDERICK DATA (the only facts you may use):\n${civicLine}${deptLine}${dataBlock}\n\nAnswer using only this data.`;

  const answer = await callModel(userContent);
  return { configured: answer !== null || hasKey(), answer, sources };
}
