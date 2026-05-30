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
      const page = await browser.newPage({ userAgent: UA });
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

