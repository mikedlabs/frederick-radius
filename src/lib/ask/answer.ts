import "server-only";
import { unstable_cache } from "next/cache";
import { qualifiedSearch, type QualifiedSearchContext } from "@/lib/search";
import { isEventSearchIntent } from "@/lib/search";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
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
  status: "answered" | "matches" | "empty";
  configured: boolean;
  usedModel: boolean;
  answer: string | null;
  sources: AskSource[];
  context?: string | null;
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
  // One user-visible deadline across every provider attempt. A stalled gateway
  // must not consume the full 30-second function ceiling before the direct
  // fallback even starts; quick failures still leave the remaining budget for
  // the next provider.
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 8_000);
  try {
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
        abortSignal: controller.signal,
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
        signal: controller.signal,
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
        abortSignal: controller.signal,
      });
      if (text) return text.trim();
    } catch {
      /* fall through to null */
    }
  }
  return null;
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * ai-gw-2: cache the (paid) model answer so identical questions over identical
 * data reuse the response instead of re-billing the LLM on every POST. The
 * cache KEY is the full `userContent` — which embeds the query AND the retrieved
 * Frederick data block + civic/dept lines — so the cached prose can never drift
 * from live data: when the catalog/events change, userContent changes and the
 * key changes. `sources` are recomputed live in askFrederick and never cached.
 *
 * Failures are NOT cached: callModel returns null when no provider is configured
 * or every provider threw (transient), so we throw a sentinel on null — a thrown
 * inner fn is not stored by unstable_cache, so the next request retries instead
 * of serving an hour of "no answer". SHA-pinned per the #509 lesson.
 */
const cachedCallModel = unstable_cache(
  async (userContent: string): Promise<string> => {
    const answer = await callModel(userContent);
    if (answer === null) throw new Error("ask:no-answer"); // don't cache failures
    // Boundary cleaning for MODEL prose, same rule as feed text: the LLM
    // loves em dashes and the voice bans them (verified in the first live
    // answer: "though fair warning—they sell out often"). Clean once here,
    // pre-cache, so every surface renders on-voice text.
    return answer.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, "-");
  },
  ["ask-answer-v1", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  { revalidate: 3600, tags: ["ask"] },
);

export async function askFrederick(
  query: string,
  context: QualifiedSearchContext = {},
): Promise<AskResult> {
  const q = (query || "").trim();
  if (!q) return { status: "empty", configured: hasKey(), usedModel: false, answer: null, sources: [] };

  // Event questions need the same live, deduplicated calendar as /events and
  // /search. Bound a cold miss so Ask still fails soft to curated seeds rather
  // than making the visitor wait on a slow third-party calendar.
  const eventPool = isEventSearchIntent(q)
    ? await Promise.race([
        assembleUnifiedEvents(new Date()).then((result) => result.publicEvents).catch(() => undefined),
        new Promise<undefined>((resolve) => setTimeout(resolve, 1_500)),
      ])
    : undefined;
  const retrieval = qualifiedSearch(q, 12, eventPool, context);
  const hits = retrieval.hits;
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
      if (sources.length < 3)
        sources.push({ slug: p.slug, name: p.name, category: p.category, city: where, href: `/places/${p.slug}` });
    } else if (h.type === "event") {
      const e = h.event as {
        slug: string;
        title: string;
        category: string;
        municipality?: string;
        starts_at?: string;
        venue_name?: string;
      };
      const when = e.starts_at
        ? new Date(e.starts_at).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })
        : "";
      lines.push(`${lines.length + 1}. EVENT: ${e.title}${when ? ` (${when})` : ""}${e.venue_name ? ` @ ${e.venue_name}` : ""}`);
      if (sources.length < 3) {
        sources.push({
          slug: e.slug,
          name: e.title,
          category: e.category,
          city: e.municipality,
          href: `/events/${e.slug}`,
        });
      }
    }
  }

  const dataBlock =
    lines.length > 0
      ? lines.join("\n")
      : "(no matching places or events were found in the Frederick catalog)";
  const constraintLines = [
    retrieval.meta.qualifiers.categoryLabel
      ? `Category filter applied: ${retrieval.meta.qualifiers.categoryLabel}.`
      : null,
    retrieval.meta.qualifiers.openNow
      ? "Open-now filter applied: every listed place has recently verified hours confirming it is open."
      : null,
    retrieval.meta.qualifiers.nearMe
      ? retrieval.meta.nearMeApplied
        ? `Nearest-first ranking applied${retrieval.meta.contextLabel ? ` from ${retrieval.meta.contextLabel}` : ""}.`
        : "The user asked for nearby results, but no usable location was available. Do not claim that any result is near or nearest."
      : null,
  ].filter(Boolean).join("\n");
  const userContent = `The user asked: "${q}"\n\n${constraintLines ? `RETRIEVAL RULES:\n${constraintLines}\n\n` : ""}FREDERICK DATA (the only facts you may use):\n${civicLine}${deptLine}${dataBlock}\n\nAnswer using only this data.`;

  // Common jobs should feel like search, not a chatbot. They already have a
  // deterministic answer in the retrieved data, so return immediately and
  // reserve the model for genuinely open-ended language. This removes paid
  // latency from open-now, downtown, nearby, event, and civic requests.
  const direct = Boolean(
    civic ||
      dept ||
      retrieval.meta.qualifiers.constrained ||
      isEventSearchIntent(q),
  );
  if (direct) {
    const answer = deterministicAnswer({
      civic: civic?.label,
      department: dept?.name,
      count: sources.length,
      category: retrieval.meta.qualifiers.categoryLabel,
      openNow: retrieval.meta.qualifiers.openNow,
      downtown: retrieval.meta.qualifiers.downtown,
      nearMe: retrieval.meta.qualifiers.nearMe,
      nearMeApplied: retrieval.meta.nearMeApplied,
      eventIntent: isEventSearchIntent(q),
    });
    return {
      status: sources.length > 0 ? "matches" : "empty",
      configured: hasKey(),
      usedModel: false,
      answer,
      sources,
      context: retrieval.meta.contextLabel,
    };
  }

  // Cached on a hit (identical question + identical data); a miss or a cached
  // failure (sentinel throw) falls back to null without poisoning the cache.
  let answer: string | null;
  try {
    answer = await cachedCallModel(userContent);
  } catch {
    answer = null;
  }
  return {
    status: answer ? "answered" : sources.length > 0 ? "matches" : "empty",
    configured: hasKey(),
    usedModel: Boolean(answer),
    answer: answer ?? deterministicAnswer({ count: sources.length }),
    sources,
    context: retrieval.meta.contextLabel,
  };
}

function deterministicAnswer({
  civic,
  department,
  count,
  category,
  openNow,
  downtown,
  nearMe,
  nearMeApplied,
  eventIntent,
}: {
  civic?: string;
  department?: string;
  count: number;
  category?: string | null;
  openNow?: boolean;
  downtown?: boolean;
  nearMe?: boolean;
  nearMeApplied?: boolean;
  eventIntent?: boolean;
}): string {
  if (civic) return `Use this official Frederick resource for ${civic.toLowerCase()}.`;
  if (department) return `Here is the official contact for ${department}.`;
  if (count === 0) return "I couldn’t find a reliable match in Radius yet. Try a shorter search or open the full map.";
  if (nearMe && !nearMeApplied) {
    return "I don’t have your location, so these are strong countywide matches, not a nearest-place claim.";
  }
  if (downtown) {
    return `Here ${count === 1 ? "is" : "are"} ${count} strong ${openNow ? "open-now " : ""}match${count === 1 ? "" : "es"} near downtown Frederick.`;
  }
  if (eventIntent) return `Here ${count === 1 ? "is" : "are"} ${count} current calendar match${count === 1 ? "" : "es"}.`;
  if (category) {
    return `Here ${count === 1 ? "is" : "are"} ${count} strong ${category.toLowerCase()} match${count === 1 ? "" : "es"}${openNow ? " with verified open hours" : ""}.`;
  }
  return `Here ${count === 1 ? "is" : "are"} the ${count} strongest match${count === 1 ? "" : "es"} in Radius.`;
}
