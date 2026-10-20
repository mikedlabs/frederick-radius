import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { DayOfWeek, Hours } from "../../src/data/places";
import { MERCHANT_HOURS_SOURCES, merchantHoursExpiry, validateMerchantHoursArtifact, type MerchantHoursArtifact, type MerchantHoursRecord, type MerchantHoursSource } from "../../src/lib/merchant-hours";
import { WEEKDAYS, isCalendarDate } from "../../src/lib/official-hours";
import { isHoursFresh } from "../../src/lib/hours-freshness";
import { easternDayKey } from "../../src/lib/tz";
import type { OfficialPageReceipt } from "./fcpl-official-hours";
const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string) => { window: { document: Document } } };
const CLOCK = "(\\d{1,2}(?::\\d{2})?\\s*[ap]m)";
function time(raw: string): string {
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!match || +match[1] < 1 || +match[1] > 12 || +(match[2] ?? 0) > 59) throw new Error("Unrecognized merchant clock.");
  return `${String(+match[1] % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0)).padStart(2, "0")}:${match[2] ?? "00"}`;
}
function set(hours: Hours, days: DayOfWeek[], open: string, close: string) {
  for (const day of days) { if (hours[day]) throw new Error("Duplicate merchant weekday."); hours[day] = [{ open: time(open), close: time(close) }]; }
}
function textPage(html: string): { text: string; document: Document } {
  const document = new JSDOM(html).window.document;
  document.querySelectorAll("script:not([type='application/ld+json']),style,noscript,template").forEach((node) => node.remove());
  // Block boundaries preserve visible source order without executing scripts/resources.
  document.querySelectorAll("p,div,li,br,h1,h2,h3,h4,section,footer").forEach((node) => node.appendChild(document.createTextNode(" ")));
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script").forEach((node) => node.remove());
  return { text: (clone.textContent ?? "").replace(/\s+/g, " ").trim(), document };
}
function oneVisibleSchedule(text: string, pattern: RegExp): RegExpMatchArray {
  const matches = [...text.matchAll(new RegExp(pattern.source, "gi"))];
  if (!matches.length || matches.some((row) => row.slice(1).map(time).join("|") !== matches[0].slice(1).map(time).join("|"))) throw new Error("Missing or conflicting visible merchant schedules.");
  return matches[0];
}
function structuredOpeningHours(document: Document, permitFlat: boolean): string[] {
  const schedules: string[] = [];
  function visit(value: unknown, flat: boolean) {
    if (Array.isArray(value)) { value.forEach((item) => visit(item, flat)); return; }
    if (!value || typeof value !== "object") return;
    if ("openingHoursSpecification" in value || ("openingHours" in value && (!permitFlat || !flat))) throw new Error("Unreviewed structured merchant hours format.");
    if ("openingHours" in value) {
      if (typeof value.openingHours !== "string") throw new Error("Unreviewed structured merchant hours format.");
      schedules.push(value.openingHours);
    }
    for (const child of Object.values(value)) if (typeof child === "object") visit(child, false);
  }
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    let value: unknown; try { value = JSON.parse(script.textContent ?? ""); } catch { throw new Error("Invalid structured merchant evidence."); }
    visit(value, true);
  }
  return schedules;
}

/** Explicit source adapters only. Unknown notices, missing days, duplicate dates or conflicting facts require review. */
export function parseMerchantOfficialHours(source: MerchantHoursSource, page: OfficialPageReceipt, now = new Date()): MerchantHoursRecord {
  if (!MERCHANT_HOURS_SOURCES.some((item) => item.slug === source.slug && item.url === source.url) || page.url !== source.url || !isHoursFresh(page.observedAt, now)) throw new Error("Unapproved merchant source or observation.");
  const { text, document } = textPage(page.html);
  if (/temporarily closed|closed (?:today|tomorrow|for)|closing early|special hours|holiday hours|until sold out|drinks only|kitchen hours/i.test(text)) throw new Error("Unresolved merchant notice or service qualifier.");
  const structured = structuredOpeningHours(document, source.slug === "gravel-and-grind-frederick");
  const hours: Hours = {};
  let from = easternDayKey(new Date(page.observedAt));
  let through: string | undefined;
  if (source.kind === "dated_week") {
    if (!/Brewer[’']?s Alley/i.test(text)) throw new Error("Missing Brewer's Alley identity.");
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const pattern = new RegExp(`(${days.join("|")}) (\\d{1,2})/(\\d{1,2})/(\\d{2}|\\d{4}): ${CLOCK} to ${CLOCK}`, "gi");
    const matches = [...text.matchAll(pattern)];
    if (matches.length !== 7) throw new Error("Incomplete or duplicated dated merchant week.");
    const dates: string[] = [];
    for (const m of matches) {
      const year = m[4].length === 2 ? 2000 + +m[4] : +m[4];
      const date = `${year}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      const day = days.findIndex((value) => value.toLowerCase() === m[1].toLowerCase());
      if (!isCalendarDate(date) || (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7 !== day) throw new Error("Dated merchant weekday does not match its date.");
      set(hours, [WEEKDAYS[day]], m[5], m[6]); dates.push(date);
    }
    dates.sort(); from = dates[0]; through = dates[6];
    if (dates.some((date, i) => Date.parse(date) !== Date.parse(from) + i * 86_400_000)) throw new Error("Nonconsecutive merchant dates.");
  } else if (source.slug === "gravel-and-grind-frederick") {
    if (!/Gravel\s*&\s*Grind/i.test(text) || !/15 East 6th Street/i.test(text) || !/Frederick,? MD\s*21701/i.test(text)) throw new Error("Missing exact Gravel & Grind identity.");
    const range = `\\s*[-–—]\\s*${CLOCK}`;
    const match = oneVisibleSchedule(text, new RegExp(`Hours Monday\\s*[-–—]\\s*Tuesday ${CLOCK}${range} Wednesday\\s*[-–—]\\s*Saturday ${CLOCK}${range} Sunday ${CLOCK}${range} Contact`, "i"));
    set(hours, ["mon", "tue"], match[1], match[2]); set(hours, ["wed", "thu", "fri", "sat"], match[3], match[4]); set(hours, ["sun"], match[5], match[6]);
    // Missing JSON-LD days are unknown, not closed. Explicit overlapping facts must agree.
    for (const schedule of structured) {
      for (const part of schedule.split(",").map((item) => item.trim()).filter(Boolean)) {
        const found = part.match(/^(Mo|Tu|We|Th|Fr|Sa|Su) (\d{2}:\d{2})-(\d{2}:\d{2})$/);
        if (!found) throw new Error("Unrecognized structured merchant weekday.");
        const day = WEEKDAYS[["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].indexOf(found[1])];
        if (hours[day]?.[0]?.open !== found[2] || hours[day]?.[0]?.close !== found[3]) throw new Error("Conflicting visible and structured merchant hours.");
      }
    }
  } else {
    if (!/Beans in the Belfry/i.test(text) || !/122 West Potomac Street,? Brunswick,? MD\s*21716/i.test(text) || !/301[ -]834[ -]7178/.test(text)) throw new Error("Missing exact Beans in the Belfry identity.");
    const match = oneVisibleSchedule(text, new RegExp(`Opening Hours Monday to Friday ${CLOCK} to ${CLOCK} Saturday and Sunday ${CLOCK} to ${CLOCK}`, "i"));
    set(hours, ["mon", "tue", "wed", "thu", "fri"], match[1], match[2]); set(hours, ["sat", "sun"], match[3], match[4]);
  }
  const expires = merchantHoursExpiry(new Date(page.observedAt).toISOString(), through);
  const record: MerchantHoursRecord = { slug: source.slug, source_url: source.url, source_name: source.name, source_sha256: createHash("sha256").update(page.html).digest("hex"), observed_at: new Date(page.observedAt).toISOString(), expires_at: expires, coverage_from: from, coverage_through: through ?? easternDayKey(new Date(expires)), kind: source.kind, hours };
  validateMerchantHoursArtifact({ schema_version: 1, places: [record], review: [] });
  return record;
}
/** Three fixed GETs, sequentially; no provider, credentials, redirects or retries. */
export async function fetchMerchantHoursPage(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 20_000): Promise<OfficialPageReceipt> {
  if (!MERCHANT_HOURS_SOURCES.some((source) => source.url === url)) throw new Error("Unapproved merchant URL.");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 20_000) throw new Error("Invalid source deadline.");
  const controller = new AbortController(); const deadline = Date.now() + timeoutMs;
  async function bounded<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Merchant source deadline exceeded.")); }, Math.max(0, deadline - Date.now())); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await bounded(fetchImpl(url, { redirect: "error", credentials: "omit", signal: controller.signal, headers: { Accept: "text/html" } }));
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html") || !response.body) throw new Error(`Merchant source failed (${response.status}).`);
    reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0; let reads = 0;
    for (;;) {
      if (Date.now() >= deadline) throw new Error("Merchant source deadline exceeded.");
      if (++reads > 2048) throw new Error("Merchant source body read limit exceeded.");
      const result = await bounded(reader.read()); if (result.done) break; bytes += result.value.byteLength; if (bytes > 512_000) throw new Error("Merchant page exceeds 512 KB."); chunks.push(result.value); }
    return { url, html: Buffer.concat(chunks).toString("utf8"), observedAt: new Date().toISOString() };
  } finally { controller.abort(); if (reader) void reader.cancel().catch(() => {}); }
}
function approvedFacts(row: MerchantHoursRecord): string {
  return JSON.stringify({ slug: row.slug, source_url: row.source_url, source_name: row.source_name, kind: row.kind, hours: Object.fromEntries(WEEKDAYS.map((day) => [day, row.hours[day]])), ...(row.kind === "dated_week" ? { coverage_from: row.coverage_from, coverage_through: row.coverage_through } : {}) });
}
/** Gate accepted/public changes, not candidates held out of those public rows. */
export function merchantHoursNeedsReview(previous: unknown, next: MerchantHoursArtifact): boolean {
  try { validateMerchantHoursArtifact(previous); validateMerchantHoursArtifact(next); } catch { return true; }
  if (previous.places.length !== next.places.length) return true;
  if (next.places.some((row) => { const before = previous.places.find((item) => item.slug === row.slug); return !before || approvedFacts(before) !== approvedFacts(row); })) return true;
  // Removing a hold restores a public claim and always needs explicit review.
  return previous.review.some((held) => !next.review.some((item) => item.slug === held.slug));
}
export async function collectMerchantOfficialHours(previous: unknown, fetchPage: typeof fetchMerchantHoursPage = fetchMerchantHoursPage, now = new Date()): Promise<{ artifact: MerchantHoursArtifact; reviewRequired: boolean }> {
  // Losing or corrupting the approved baseline is not permission to re-enroll sources.
  validateMerchantHoursArtifact(previous);
  const artifact: MerchantHoursArtifact = { schema_version: 1, places: [], review: [] };
  for (const source of MERCHANT_HOURS_SOURCES) {
    const approved = previous.places.find((row) => row.slug === source.slug);
    const held = previous.review.find((row) => row.slug === source.slug);
    const hold = (reason: MerchantHoursArtifact["review"][number]["reason"], candidate = held?.candidate) => {
      if (approved) artifact.places.push(approved);
      artifact.review.push({ slug: source.slug, checked_at: now.toISOString(), reason, ...(candidate ? { candidate } : {}) });
    };
    let page: OfficialPageReceipt;
    try { page = await fetchPage(source.url); } catch { hold("source_unavailable"); continue; }
    let candidate: MerchantHoursRecord;
    try { candidate = parseMerchantOfficialHours(source, page, now); } catch { hold("unparseable_or_conflicted"); continue; }
    if (approved && !held && approvedFacts(approved) === approvedFacts(candidate)) {
      artifact.places.push(candidate);
    } else {
      // A dated new week, changed fact, new enrollment or unresolved prior hold
      // remains a proposal. Repeated successful fetches cannot auto-accept it.
      hold(approved && approvedFacts(approved) === approvedFacts(candidate) ? "pending_acceptance" : "changed_facts", candidate);
    }
  }
  validateMerchantHoursArtifact(artifact);
  return { artifact, reviewRequired: merchantHoursNeedsReview(previous, artifact) };
}
