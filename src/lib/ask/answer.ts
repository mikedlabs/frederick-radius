import "server-only";
import { unstable_cache } from "next/cache";
import { search } from "@/lib/search";
import { matchCivicAction } from "@/data/civic-actions";
import { matchDepartment } from "@/data/department-contacts";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { clockLine, timeAnchorOf, eventContextLines, rankForSources, filterCitedSources, stripInlineMarkdown, wantsParking, wantsWeather, wantIntentOf, type WantIntent } from "@/lib/ask/context";
import { getOpenStatus, isOpenNow, formatHoursLine } from "@/lib/hours";
import { PARKING_GARAGES, PARKING_RATE_SCHEDULE, PARKING_OFFICE } from "@/data/parking-garages";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER, haversineMeters } from "@/lib/geo";
import { buildWantAnswer, type WantRow, type WantRefinable } from "@/lib/want-answer";
import { cuisinesOf, cuisineLabel } from "@/lib/cuisine";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { fieldNotesFor } from "@/lib/loaders/fieldNotes";
import type { Place } from "@/data/places";

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
- The CURRENT DATE & TIME is always provided. Use it: "tonight", "today", and "this weekend" questions are answered directly from the EVENTS block. Never say you don't know today's date.
- Place lines may carry a LIVE open state ("Open until 9pm", "Closed · Opens Thu 8am") computed for the current time — trust it. A line with no open state means the hours are unconfirmed: say so rather than guessing. For "open now" questions, recommend only places marked Open.
- If the data doesn't answer the question, say so plainly in one sentence and suggest searching or checking the map — do not guess.
- LOCAL NOTE fields are this guide's own verified field research (parking tricks, insider details, happy hours). Weave the relevant one into your answer — it's the detail a local friend would add.
- A RANKED PICKS block, when present, is this guide's own ranked answer for that exact craving, strongest first with live open state. Recommend from it, in its order, before anything in the numbered search list.
- DOWNTOWN PARKING and WEATHER blocks, when present, are verified/live data. Answer from them directly.
- Keep it tight: 2–4 sentences, then name your top 1–3 specific picks from the data.
- Sound like a knowledgeable local, not a chatbot. No "as an AI", no filler.
- PLAIN TEXT ONLY. No markdown of any kind: no asterisks, underscores, backticks, bullet lists, headers, or [text](url) links. Write prose.`;

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
    // answer: "though fair warning—they sell out often"), and it italicizes
    // for emphasis even when told not to — the Ask surfaces render PLAIN
    // text, so raw asterisks reached users (the Reddit screenshot). Clean
    // once here, pre-cache, so every surface renders on-voice text.
    return stripInlineMarkdown(answer).replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, "-");
  },
  ["ask-answer-v2", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  { revalidate: 3600, tags: ["ask"] },
);

/** The verified downtown-parking block: the five city garages plus the one
 *  uniform rate schedule. Pure data, so parking questions stop getting the
 *  honest shrug ("the data covers parks, not parking" — ask audit). */
function parkingContextBlock(): string {
  const garages = PARKING_GARAGES.map((g) => `- ${g.name} — ${g.address} — ${g.hours}`).join("\n");
  return `DOWNTOWN PARKING (City of Frederick, rates verified):\nAll five city garages: ${PARKING_RATE_SCHEDULE.summary}.\n${garages}\n- Parking office: ${PARKING_OFFICE.phone}.\n\n`;
}

/** Live NWS forecast, as up to four daily periods. Fail-soft: weather is
 *  context, never a reason to fail the answer. */
async function weatherContextBlock(): Promise<string> {
  try {
    const fc = await getNwsForecast(FREDERICK_CENTER);
    const days = (fc?.daily ?? []).filter((p) => p.name).slice(0, 4);
    if (days.length === 0) return "";
    const lines = days.map((p) => {
      const pop = p.probabilityOfPrecipitation;
      return `- ${p.name}: ${p.temperature}°${p.temperatureUnit}, ${p.shortForecast}${pop ? `, ${pop}% chance of rain` : ""}`;
    });
    return `WEATHER (live National Weather Service forecast for Frederick):\n${lines.join("\n")}\n\n`;
  } catch {
    return "";
  }
}

/** One LOCAL NOTE per place — the field-notes moat, compact. Insider detail
 *  first (the thing you can't Google), then the parking trick, then the
 *  happy hour. */
function localNoteFor(slug: string): string {
  const fn = fieldNotesFor(slug);
  if (!fn) return "";
  const tip =
    fn.insider?.[0]?.text ??
    fn.parking?.text ??
    (fn.happy_hour ? `Happy hour ${fn.happy_hour.schedule}${fn.happy_hour.details ? ` (${fn.happy_hour.details})` : ""}` : "");
  if (!tip) return "";
  const compact = tip.length > 160 ? `${tip.slice(0, 157)}…` : tip;
  return ` — LOCAL NOTE: ${compact}`;
}

/** "Downtown" is the same 1-mile core /map uses (mode-scope.ts). */
const DOWNTOWN_RADIUS_M = 1609;

/**
 * The Tier 2 planner's grounding: a meal/cuisine/craving question routed
 * through the SAME machinery the /today "I want…" strip runs (buildWantAnswer),
 * so "good breakfast spot downtown" gets the guide's ranked, live-open-state
 * answer instead of keyword-search noise — no place is NAMED "breakfast", so
 * search alone could never find one.
 */
function wantContextBlock(
  intent: WantIntent,
  now: Date,
): { block: string; picks: WantRow[]; label: string } | null {
  const town = intent.area?.kind === "town" ? MUNICIPALITY_BY_SLUG[intent.area.slug] : null;
  const baseRefine = (p: WantRefinable) => {
    if (intent.cuisine && !cuisinesOf(p).includes(intent.cuisine)) return false;
    if (intent.area?.kind === "downtown" && haversineMeters(FREDERICK_CENTER, p.geom) > DOWNTOWN_RADIUS_M) return false;
    if (town && p.municipality !== town.slug) return false;
    return true;
  };
  // An explicit breakfast/brunch ASK still means breakfast FOOD whatever the
  // clock says. The meal's category gate is honest for the time-band tile
  // ("open during breakfast IS breakfast") but too loose here: at 1 PM the
  // nearest open Thai spot led the block (seen live). Gate the broad
  // restaurant bucket to places whose own signals say breakfast — breakfast/
  // brunch Google types, pancake/waffle names, delis, diners — and let
  // coffee/bakery/food-truck pass untouched. If the gate empties a small
  // town's set, fall back to the ungated meal answer rather than a false
  // "none in the catalog".
  const BREAKFAST_SIGNAL = new Set(["breakfast", "bakery", "coffee", "deli"]);
  const breakfasty = (p: WantRefinable) =>
    p.category !== "restaurant" ||
    /\bdiner\b/i.test(p.name) ||
    cuisinesOf(p).some((s) => BREAKFAST_SIGNAL.has(s));
  const gateBreakfast = !intent.cuisine && (intent.key === "breakfast" || intent.key === "brunch");
  // Origin seeds the ORDERING only (downtown core / the town's centroid);
  // approximateOrigin makes the hero the strongest PLACE among the near-open
  // set, never the fluke nearest (the Chick-fil-A lesson, PR #1123).
  const origin = town ? town.centroid : FREDERICK_CENTER;
  let wa = buildWantAnswer(intent.key, null, origin, now, {
    approximateOrigin: true,
    refine: gateBreakfast ? (p) => baseRefine(p) && breakfasty(p) : baseRefine,
  });
  if (gateBreakfast && (!wa || wa.total === 0)) {
    wa = buildWantAnswer(intent.key, null, origin, now, { approximateOrigin: true, refine: baseRefine });
  }
  if (!wa) return null;

  const areaText =
    intent.area?.kind === "downtown" ? " in downtown Frederick" : town ? ` in ${town.name}` : "";
  const what = intent.cuisine
    ? `${cuisineLabel(intent.cuisine)}${wa.label !== "Food" ? ` for ${wa.label.toLowerCase()}` : ""}`
    : wa.label;
  // Zero matches is itself an answer — say it so the model can be plainly
  // honest ("the guide has no Thai in Brunswick") instead of hedging.
  if (wa.total === 0) {
    return {
      block: `RANKED PICKS — ${what}${areaText}: (no matching places in the catalog)\n`,
      picks: [],
      label: wa.label,
    };
  }

  const line = (r: WantRow) =>
    `- ${r.name}${r.where ? ` (${r.where})` : ""} — ${r.fact}${r.detail ? ` — ${r.detail}` : ""}${r.deal ? ` — ${r.deal}` : ""}${r.tip ? ` — LOCAL NOTE: ${r.tip}` : ""}`;
  const open = [wa.hero, ...wa.also].filter((r): r is WantRow => r != null).slice(0, 5);
  const later = wa.later.slice(0, 3);
  const notable = open.length === 0 && later.length === 0 ? wa.notable.slice(0, 4) : [];
  const parts: string[] = [];
  if (open.length > 0) parts.push(`Open now:\n${open.map(line).join("\n")}`);
  if (later.length > 0) parts.push(`Opens later today:\n${later.map(line).join("\n")}`);
  if (notable.length > 0) parts.push(`Notable (hours not posted):\n${notable.map(line).join("\n")}`);
  return {
    block: `RANKED PICKS — ${what}${areaText} (this guide's own list, strongest first, open state live):\n${parts.join("\n")}\n`,
    picks: [...open, ...later, ...notable],
    label: wa.label,
  };
}

export async function askFrederick(query: string, now: Date = new Date()): Promise<AskResult> {
  const q = (query || "").trim();
  if (!q) return { configured: hasKey(), answer: null, sources: [] };

  const hits = search(q, 18);
  const lines: string[] = [];
  const sources: AskSource[] = [];

  // Time-anchored grounding: "music tonight" / "what's on this weekend" is
  // THE natural question for a local guide, and keyword search alone can
  // never answer it — the window matters more than the words. Feed the
  // model the same unified event set /today renders, bucketed to the asked
  // window, with clock times. (The live failure this closes: "I don't have
  // today's date in the data", screenshotted on Reddit.)
  // Dataset grounders beyond events: verified parking and live weather,
  // included only when the question asks (they'd be noise elsewhere, and
  // the weather line varies too much to sit in every cache key).
  const parkingBlock = wantsParking(q) ? parkingContextBlock() : "";
  if (parkingBlock) {
    sources.push({ slug: "parking-guide", name: "Parking guide", category: "civic", city: "", href: "/parking" });
  }
  const weatherBlock = wantsWeather(q) ? await weatherContextBlock() : "";
  if (weatherBlock) {
    sources.push({ slug: "pulse-weather", name: "Hourly & 7-day forecast", category: "civic", city: "", href: "/pulse?open=weather" });
  }

  // Want-intent grounding (Tier 2): a meal/cuisine/craving question routes
  // through the ranked open-now machinery /today runs, so the model answers
  // "good breakfast spot downtown" from the guide's own list.
  const intent = wantIntentOf(q, now);
  const want = intent ? wantContextBlock(intent, now) : null;
  const wantBlock = want ? `${want.block}\n` : "";
  const wantSlugs = new Set((want?.picks ?? []).map((r) => r.slug));
  for (const r of (want?.picks ?? []).slice(0, 3)) {
    sources.push({
      slug: r.slug,
      name: r.name,
      category: want!.label.toLowerCase(),
      city: r.where ?? "",
      href: `/places/${r.slug}`,
    });
  }

  const anchor = timeAnchorOf(q);
  let eventsBlock = "";
  if (anchor) {
    try {
      const { publicEvents } = await assembleUnifiedEvents(now);
      const ctx = eventContextLines(publicEvents, anchor, now, q);
      eventsBlock = `${ctx.block}\n`;
      for (const e of rankForSources(ctx.picked, q).slice(0, 3)) {
        sources.push({ slug: e.slug, name: e.title, category: "event", city: e.municipality_name ?? "", href: `/events/${e.slug}` });
      }
    } catch {
      /* events unavailable → the search hits below still ground the answer */
    }
  }

  // Civic intent grounding: if the question is a "how do I…" (register to
  // vote, report a pothole, pay a bill, permits…), surface the county's
  // AUTHORITATIVE link so the model cites a real action, never an invented
  // one. Listed first so it leads the answer when relevant.
  // One live-caught false join: "where should I park" is CAR parking, but
  // the civic/department matchers hear the bare verb "park" and answer with
  // Parks & Recreation. When the parking grounder owns the question, the
  // parks cards are noise — unless the question really says parks/rec.
  const asksParksRec = /\b(parks|recreation|rec center)\b/i.test(q);
  let civic = matchCivicAction(q);
  if (civic?.id === "parks-rec-centers" && parkingBlock && !asksParksRec) civic = null;
  if (civic) {
    sources.push({ slug: civic.id, name: civic.label, category: "civic", city: "", href: civic.url });
  }
  const civicLine = civic
    ? `OFFICIAL CIVIC ACTION (cite this link if relevant): ${civic.label} → ${civic.url}\n`
    : "";

  // Department grounding: "number for animal control / parks & rec" →
  // the real phone + address, never invented.
  let dept = matchDepartment(q);
  if (dept && /parks/i.test(dept.name) && parkingBlock && !asksParksRec) dept = null;
  if (dept) {
    sources.push({ slug: `dept-${dept.slug}`, name: dept.name, category: "civic", city: "", href: dept.url });
  }
  const deptLine = dept
    ? `OFFICIAL DEPARTMENT CONTACT (cite if relevant): ${dept.name}${dept.phone ? ` — ${dept.phone}` : ""}${dept.address ? ` — ${dept.address}` : ""}\n`
    : "";

  // "Open now" intent: the questions that burned us are the TIME-anchored
  // kind, and "is anything open" is the place-side version. Confirmed-open
  // places lead the block so the model's picks are doors that are actually
  // unlocked; the open state itself rides on every place line below.
  const wantsOpen = /\bopen\b/i.test(q);
  const placeStatus = (place: Place) =>
    getOpenStatus(place.hours, { verified: place.hours_verified ?? false }, now);
  const ordered = wantsOpen
    ? [...hits].sort((a, b) => {
        const openRank = (h: (typeof hits)[number]) =>
          h.type === "place" && isOpenNow(placeStatus(h.place)) ? 0 : 1;
        return openRank(a) - openRank(b);
      })
    : hits;

  for (const h of ordered) {
    if (lines.length >= 14) break;
    if (h.type === "place") {
      const p = h.place;
      // Already carried (better) by the ranked-picks block — a duplicate
      // search line would just dilute the block the model is told to prefer.
      if (wantSlugs.has(p.slug)) continue;
      const where = (p as { city?: string; municipality?: string }).city || (p as { municipality?: string }).municipality || "";
      const blurb = (p.short_blurb || "").slice(0, 90);
      // Live open state, computed for `now` from the same verified hours the
      // place pages use. Unknown stays silent; unverified is stated only
      // when the question is about being open (honesty without noise).
      const status = placeStatus(p);
      const openBit =
        status.state === "unknown"
          ? ""
          : status.state === "unverified"
            ? wantsOpen
              ? " — hours not confirmed"
              : ""
            : ` — ${formatHoursLine(status)}`;
      // Phone rides along: the model honestly says "call to confirm" for
      // hours-less places (the double-decker tour), and the number we hold
      // is what makes that advice actionable. The LOCAL NOTE (verified field
      // research) replaces the generic blurb when we have one — insider
      // detail beats ad copy.
      const note = localNoteFor(p.slug);
      lines.push(
        `${lines.length + 1}. ${p.name} — ${p.category}${where ? `, ${where}` : ""}${openBit}${p.phone ? ` — ${p.phone}` : ""}${note || (blurb ? ` — ${blurb}` : "")}`,
      );
      if (sources.length < 6)
        sources.push({ slug: p.slug, name: p.name, category: p.category, city: where, href: `/places/${p.slug}` });
    } else if (h.type === "event") {
      const e = h.event as { slug?: string; title: string; starts_at?: string; venue_name?: string };
      const when = e.starts_at
        ? new Date(e.starts_at).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })
        : "";
      lines.push(`${lines.length + 1}. EVENT: ${e.title}${when ? ` (${when})` : ""}${e.venue_name ? ` @ ${e.venue_name}` : ""}`);
      if (e.slug && sources.length < 6 && !sources.some((s) => s.slug === e.slug)) {
        sources.push({ slug: e.slug, name: e.title, category: "event", city: "", href: `/events/${e.slug}` });
      }
    }
  }

  const dataBlock =
    lines.length > 0
      ? lines.join("\n")
      : "(no matching places or events were found in the Frederick catalog)";
  // The clock line is HOUR-granular (see clockLine) so this prompt — which
  // is also the answer-cache key — stays stable within the hour.
  const userContent = `The user asked: "${q}"\n\nCURRENT DATE & TIME in Frederick County: ${clockLine(now)} (Eastern).\n\nFREDERICK DATA (the only facts you may use):\n${civicLine}${deptLine}${parkingBlock}${weatherBlock}${wantBlock}${eventsBlock}${dataBlock}\n\nAnswer using only this data.`;

  // Cached on a hit (identical question + identical data); a miss or a cached
  // failure (sentinel throw) falls back to null without poisoning the cache.
  let answer: string | null;
  try {
    answer = await cachedCallModel(userContent);
  } catch {
    answer = null;
  }
  // The cards under the answer are CITATIONS, not the raw retrieval — a
  // funeral home rendered under "anything fun tomorrow night" when sources
  // were the unfiltered search hits.
  return { configured: answer !== null || hasKey(), answer, sources: filterCitedSources(sources, answer) };
}
