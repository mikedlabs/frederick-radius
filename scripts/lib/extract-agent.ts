/**
 * Extraction engine — the shared core behind every "go get the buried
 * data" agent (civic contacts, venue events, specials, hours, …).
 *
 * The pattern, once, for all of them:
 *   fetchPageText(url)            → clean text from any public page
 *   extractWithClaude(prompt)     → strict JSON, "omit what isn't there"
 *
 * Each agent (scripts/ingest-*.ts) supplies a source registry + an
 * extraction shape; this module does the fetching and the model call.
 * Plain fetch to the Anthropic Messages API — no SDK dependency.
 *
 * Hard rules baked in:
 *  - Never fabricate: the prompt template forbids guessing; a failed
 *    fetch returns null and the caller leaves prior data untouched.
 *  - Always cheap: text is capped before the model sees it.
 *  - Always attributable: callers stamp { url, fetchedAt } on records.
 */

const API_KEY = process.env.ANTHROPIC_API_KEY;
const DEFAULT_MODEL = process.env.EXTRACT_MODEL || "claude-haiku-4-5-20251001";
const UA = "FrederickRadius/1.0 (+civic data ingest)";

function htmlToText(html: string, maxChars: number): string {
  return html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

/**
 * Fetch a public page and reduce it to model-friendly text.
 *
 * Real-world reality (learned by testing actual venue sites): many
 * calendars are JS-rendered (events aren't in the static HTML) or the
 * server 403s a bare fetch. Pass `render: true` to load the page in a
 * real headless browser (Playwright, already a project dep) so those
 * sources work too. Plain fetch is the fast default for static pages.
 */
export async function fetchPageText(
  url: string,
  opts: { render?: boolean; maxChars?: number } = {},
): Promise<string | null> {
  const maxChars = opts.maxChars ?? 18_000;

  if (opts.render) {
    try {
      const { chromium } = await import("@playwright/test");
      const browser = await chromium.launch();
      const page = await browser.newPage({
        userAgent: UA,
        // Opt-in escape hatch for environments behind a TLS-intercepting
        // proxy whose CA the bundled Chromium does not trust (render would
        // otherwise fail ERR_CERT_AUTHORITY_INVALID on every page). Off by
        // default, so production and CI keep full certificate validation.
        ignoreHTTPSErrors: process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === "1",
      });
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForTimeout(1200); // let late calendar widgets settle
      const text = (await page.innerText("body")).replace(/\s+/g, " ").trim().slice(0, maxChars);
      await browser.close();
      return text || null;
    } catch (err) {
      console.log(`  ✗ ${url} (render) → ${(err as Error).message}`);
      return null;
    }
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) {
      console.log(`  ✗ ${url} → HTTP ${r.status}${r.status === 403 ? " (try render:true)" : ""}`);
      return null;
    }
    return htmlToText(await r.text(), maxChars);
  } catch (err) {
    console.log(`  ✗ ${url} → ${(err as Error).message}`);
    return null;
  }
}

/**
 * A normalized event as pulled from a structured feed (no model call).
 * Mirrors the shape the venue agent already writes, minus the per-venue
 * stamping the caller adds (venue_slug, venue_name, source).
 */
export type FeedEvent = {
  title: string;
  starts_at: string; // ISO 8601
  ends_at?: string;
  description?: string;
  ticket_url?: string;
};

/**
 * Parse a Squarespace events collection (the `?format=json` response) to
 * normalized events — deterministically, with no model call. Squarespace
 * exposes every events page as JSON at `<collection-url>?format=json`,
 * with an `upcoming` array of items carrying `title`, `startDate` /
 * `endDate` (millisecond epoch integers), `excerpt`, and `fullUrl`.
 *
 * This is the preferred collector for any Squarespace venue: it is exact
 * (no scraping, no guessing), cheap (no token cost), and stable across
 * site redesigns. Falls back to nothing — a caller that gets [] should
 * try the render+model path.
 *
 * No fabrication: an item with no title or no parseable start date is
 * dropped rather than invented. `baseUrl` (the site origin) turns the
 * relative `fullUrl` into an absolute ticket/detail link when present.
 */
export function parseSquarespaceEvents(json: unknown, baseUrl?: string): FeedEvent[] {
  const root = json as { upcoming?: unknown } | null;
  const items = root && Array.isArray(root.upcoming) ? root.upcoming : [];
  const origin = (() => {
    if (!baseUrl) return "";
    try {
      return new URL(baseUrl).origin;
    } catch {
      return "";
    }
  })();

  const out: FeedEvent[] = [];
  for (const raw of items) {
    const it = raw as {
      title?: unknown;
      startDate?: unknown;
      endDate?: unknown;
      excerpt?: unknown;
      fullUrl?: unknown;
    };
    const title = typeof it.title === "string" ? it.title.trim() : "";
    const startMs = typeof it.startDate === "number" ? it.startDate : NaN;
    if (!title || !Number.isFinite(startMs)) continue; // never invent

    const ev: FeedEvent = {
      title,
      starts_at: new Date(startMs).toISOString(),
    };
    if (typeof it.endDate === "number" && Number.isFinite(it.endDate)) {
      ev.ends_at = new Date(it.endDate).toISOString();
    }
    // Excerpt is HTML; strip to one plain line if present.
    if (typeof it.excerpt === "string" && it.excerpt.trim()) {
      const plain = it.excerpt.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (plain) ev.description = plain.slice(0, 280);
    }
    if (typeof it.fullUrl === "string" && it.fullUrl) {
      ev.ticket_url = origin ? `${origin}${it.fullUrl}` : it.fullUrl;
    }
    out.push(ev);
  }
  return out;
}

/**
 * Fetch a Squarespace collection's JSON feed and parse it to events.
 * `collectionUrl` is the human events page (e.g. ".../livemusic"); this
 * appends `?format=json`. Returns [] on any fetch/parse failure so the
 * caller can fall back to render+model without a thrown error.
 */
export async function fetchSquarespaceEvents(collectionUrl: string): Promise<FeedEvent[]> {
  const sep = collectionUrl.includes("?") ? "&" : "?";
  const url = `${collectionUrl}${sep}format=json`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) {
      console.log(`  ✗ ${url} → HTTP ${r.status}`);
      return [];
    }
    const json = JSON.parse(await r.text());
    return parseSquarespaceEvents(json, collectionUrl);
  } catch (err) {
    console.log(`  ✗ ${url} (feed) → ${(err as Error).message}`);
    return [];
  }
}

/**
 * Ask Claude to extract structured JSON. `instructions` describes the
 * shape + rules; `content` is the page text. Returns parsed JSON (object
 * or array) or null. Enforces the "omit what isn't on the page" rule via
 * the shared preamble so no agent can drift into guessing.
 */
export async function extractJson<T = unknown>(
  instructions: string,
  content: string,
  opts: { model?: string; maxTokens?: number } = {},
): Promise<T | null> {
  if (!API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  const preamble =
    "You extract structured data from a public webpage's text. Return ONLY JSON — no prose. " +
    "Critically: include ONLY facts clearly present in the text. Never invent phone numbers, " +
    "dates, prices, or hours. If you can't find something, omit it. If nothing applies, return an empty result.\n\n";

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model || DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 1500,
      messages: [{ role: "user", content: `${preamble}${instructions}\n\nPAGE TEXT:\n${content}` }],
    }),
  });
  if (!r.ok) {
    console.log(`  ✗ Claude → HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return null;
  }
  const data = (await r.json()) as { content?: { text?: string }[] };
  const raw = data.content?.[0]?.text ?? "";
  const match = raw.match(/[[{][\s\S]*[\]}]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    console.log("  ✗ Claude returned non-JSON");
    return null;
  }
}

/**
 * Extract structured JSON from an IMAGE using Claude vision. Some venues
 * publish their calendar only as a graphic (e.g. a Wix-hosted PNG), with
 * no text or feed to read. This sends the image URL to the model under
 * the same hard rule as extractJson — include only what is legibly in
 * the image, never invent a date or act — and returns parsed JSON or null.
 *
 * Anthropic fetches the image by URL server-side (type: "url"), so no
 * download is needed here. Vision needs a more capable model than the
 * text default; override with EXTRACT_VISION_MODEL if desired.
 */
export async function extractJsonFromImage<T = unknown>(
  instructions: string,
  imageUrl: string,
  opts: { model?: string; maxTokens?: number } = {},
): Promise<T | null> {
  if (!API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  const model =
    opts.model || process.env.EXTRACT_VISION_MODEL || "claude-sonnet-4-6";
  const preamble =
    "You read structured data from an image of a calendar or event flyer. Return ONLY JSON — no prose. " +
    "Critically: include ONLY events legibly shown in the image. Never invent a date, time, or act, and " +
    "never guess at text you cannot read. If the image has no readable events, return an empty result.\n\n";

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 2000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            { type: "text", text: `${preamble}${instructions}` },
          ],
        },
      ],
    }),
  });
  if (!r.ok) {
    console.log(`  ✗ Claude vision → HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return null;
  }
  const data = (await r.json()) as { content?: { text?: string }[] };
  const raw = data.content?.[0]?.text ?? "";
  const match = raw.match(/[[{][\s\S]*[\]}]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    console.log("  ✗ Claude vision returned non-JSON");
    return null;
  }
}

/** ISO timestamp helper for provenance stamps. */
export const nowISO = () => new Date().toISOString();

/**
 * Preflight: verify the API key exists AND is accepted, with a clear,
 * actionable message — so a missing/invalid key in CI shows an obvious
 * one-liner instead of a buried stack trace. Returns true if good;
 * prints guidance + returns false otherwise (caller exits 0, not a crash,
 * so the workflow reads as "nothing to do" rather than a hard failure).
 */
export async function preflightKey(): Promise<boolean> {
  if (!API_KEY) {
    console.error(
      "\n✗ ANTHROPIC_API_KEY is not set.\n" +
        "  → Add it as a GitHub repo secret: Settings → Secrets and variables\n" +
        "    → Actions → New repository secret → name it exactly ANTHROPIC_API_KEY.\n" +
        "  The agent can't extract anything without it; skipping this run.\n",
    );
    return false;
  }
  // Cheap liveness ping so an INVALID or out-of-credit key reports
  // precisely, instead of failing 60 times mid-run.
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  if (r.status === 401) {
    console.error("\n✗ ANTHROPIC_API_KEY is set but REJECTED (HTTP 401). The key is wrong or revoked — re-copy it from console.anthropic.com.\n");
    return false;
  }
  if (r.status === 429) {
    console.error("\n✗ ANTHROPIC_API_KEY works but is OUT OF CREDIT / rate-limited (HTTP 429). Add credit at console.anthropic.com → Billing.\n");
    return false;
  }
  if (!r.ok && r.status !== 400) {
    console.error(`\n✗ Anthropic API preflight failed (HTTP ${r.status}). Transient? Try the run again.\n`);
    return false;
  }
  console.log("✓ ANTHROPIC_API_KEY verified — extracting.");
  return true;
}

