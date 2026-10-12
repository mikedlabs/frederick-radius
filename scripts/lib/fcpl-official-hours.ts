import { createHash } from "node:crypto";
import { createRequire } from "node:module";
// The existing dev dependency parses static HTML only. Scripts/resources stay off.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string) => { window: { document: Document } };
};
import type { DayOfWeek, Hours, HoursDateException } from "../../src/data/places";
import { FCPL_BRANCHES, FCPL_HOURS_URL, FCPL_CLOSURES_URL, WEEKDAYS, isCalendarDate, validateOfficialHoursArtifact, type OfficialHoursArtifact } from "../../src/lib/official-hours";
import { easternDayKey } from "../../src/lib/tz";

export type OfficialPageReceipt = { url: string; html: string; observedAt: string };
const LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
function time(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2}) (am|pm)$/i);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2]) > 59) throw new Error(`Unrecognized FCPL clock: ${value}`);
  return `${String(Number(match[1]) % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0)).padStart(2, "0")}:${match[2]}`;
}
function shift(date: string, count: number): string { return new Date(Date.parse(`${date}T12:00:00Z`) + count * 86_400_000).toISOString().slice(0, 10); }

/** Fixed publisher adapters. Any missing branch/day/holiday or ambiguous text rejects the whole refresh. */
export function parseFcplOfficialHours(weekly: OfficialPageReceipt, closures: OfficialPageReceipt, now = new Date()): OfficialHoursArtifact {
  if (weekly.url !== FCPL_HOURS_URL || closures.url !== FCPL_CLOSURES_URL) throw new Error("Unexpected official FCPL source.");
  for (const page of [weekly, closures]) {
    if (!Number.isFinite(Date.parse(page.observedAt)) || Date.parse(page.observedAt) > now.getTime() + 300_000 || now.getTime() - Date.parse(page.observedAt) > 7 * 86_400_000) throw new Error("Unusable source observation date.");
  }
  const weekDocument = new JSDOM(weekly.html).window.document;
  const places = FCPL_BRANCHES.map(([slug, branch]) => {
    const rows = [...weekDocument.querySelectorAll(".views-row")].filter((row) => row.querySelector(`.views-field-title a[href="/branches-hours/${branch}"]`));
    if (rows.length !== 1) throw new Error(`Missing or duplicate branch: ${branch}`);
    const row = rows[0];
    const hours: Hours = {};
    for (const item of row.querySelectorAll(".office-hours__item")) {
      const label = clean(item.querySelector(".office-hours__item-label")?.textContent).replace(/:$/, "");
      const days = label.split(/\s+-\s+/);
      const first = LABELS.indexOf(days[0]);
      const last = LABELS.indexOf(days[1] ?? days[0]);
      if (first < 0 || last < first || days.length > 2) throw new Error(`Unrecognized FCPL weekday: ${label}`);
      const slots = clean(item.querySelector(".office-hours__item-slots")?.textContent);
      const comment = clean(item.querySelector(".office-hours__item-comments")?.textContent);
      if ((!slots && comment !== "CLOSED") || (slots && comment)) throw new Error(`Ambiguous FCPL schedule: ${slug}`);
      const range = slots ? slots.split(/\s*[-–]\s*/) : [];
      if (range.length && range.length !== 2) throw new Error(`Ambiguous FCPL hours: ${slots}`);
      for (let index = first; index <= last; index++) {
        const day = WEEKDAYS[index] as DayOfWeek;
        if (hours[day]) throw new Error(`Duplicate FCPL weekday: ${slug}/${day}`);
        hours[day] = range.length ? [{ open: time(range[0]), close: time(range[1]) }] : [];
      }
    }
    return { slug, source_url: `https://www.fcpl.org/branches-hours/${branch}`, source_name: clean(row.querySelector(".views-field-title")?.textContent), hours };
  });
  const document = new JSDOM(closures.html).window.document;
  const tables = [...document.querySelectorAll("table")].filter((table) => /^\d{4} Holidays$/.test(clean(table.querySelector("caption")?.textContent)));
  if (!tables.length) throw new Error("Missing dated holiday calendar.");
  const years: number[] = [];
  const exceptions: HoursDateException[] = [];
  // These are the publisher's reviewed full-closure labels, not inferred keywords.
  const fullClosure = /^(?:Libraries Closed - Staff Development Day|Veteran's Day|New Year's Day - Libraries Closed|New Year's Eve - Libraries Closed|Martin Luther King Day|Easter|Memorial Day|Juneteenth|Independence Day|Labor Day|Thanksgiving|Christmas Holiday)$/;
  for (const table of tables) {
    const year = Number(clean(table.querySelector("caption")?.textContent).slice(0, 4));
    if (years.includes(year)) throw new Error("Duplicate holiday year.");
    years.push(year);
    const rows = [...table.querySelectorAll("tbody tr")];
    if (!rows.length) throw new Error("Empty holiday calendar.");
    for (const row of rows) {
      const reason = clean(row.querySelector(".views-field-title")?.textContent);
      const early = /^(?:Thanksgiving Eve|New Year's Eve) - Libraries close at 5\s?pm$/i.test(reason);
      if (!early && !fullClosure.test(reason)) throw new Error(`Unreviewed FCPL closure wording: ${reason}`);
      const dates = [...row.querySelectorAll("time[datetime]")].map((el) => el.getAttribute("datetime")!);
      if (dates.length < 1 || dates.length > 2 || dates.some((d) => !isCalendarDate(d)) || !dates[0].startsWith(String(year)) || (dates[1] && (dates[1] < dates[0] || Date.parse(dates[1]) - Date.parse(dates[0]) > 7 * 86_400_000))) throw new Error("Invalid holiday date range.");
      for (let date = dates[0]; date <= (dates[1] ?? dates[0]); date = shift(date, 1)) exceptions.push({ date, reason, ...(early ? { closes_at: "17:00" } : { closed: true as const }) });
    }
  }
  // Active banners can announce weather/branch closures outside the annual
  // calendar. Only this reviewed, explicitly dated all-library notice is
  // accepted, and only when the same closure is present in the calendar.
  for (const page of [weekDocument, document]) {
    const blocks = [...page.querySelectorAll(".news-alerts")];
    for (const block of blocks) {
      const notices = [...block.querySelectorAll(".views-field-field-emergency-text")];
      if (!notices.length && /closed|closing|hours|delay|weather/i.test(clean(block.textContent))) throw new Error("Unrecognized active FCPL hours notice.");
      for (const notice of notices) {
        const text = clean(notice.textContent);
        const match = text.match(/^Frederick County Public Libraries will be closed on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4}) for Staff Development Day\.$/);
        if (!match) throw new Error("Unreviewed active FCPL closure notice.");
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const date = `${match[4]}-${String(months.indexOf(match[2]) + 1).padStart(2, "0")}-${match[3].padStart(2, "0")}`;
        if (!isCalendarDate(date) || new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)) !== match[1] || !exceptions.some((item) => item.date === date && item.closed && item.reason === "Libraries Closed - Staff Development Day")) throw new Error("Active FCPL closure notice is not covered by the dated calendar.");
      }
    }
  }

  years.sort();
  const observationDay = easternDayKey(new Date(Math.min(Date.parse(weekly.observedAt), Date.parse(closures.observedAt))));
  const observationYear = Number(observationDay.slice(0, 4));
  if (!years.includes(observationYear) || years.some((year, i) => i > 0 && year !== years[i - 1] + 1)) throw new Error("Holiday calendar does not cover the observation year.");
  const artifact: OfficialHoursArtifact = {
    schema_version: 1, source_id: "fcpl_branch_hours",
    weekly: { url: FCPL_HOURS_URL, observed_at: weekly.observedAt, sha256: createHash("sha256").update(weekly.html).digest("hex") },
    closures: { url: FCPL_CLOSURES_URL, observed_at: closures.observedAt, sha256: createHash("sha256").update(closures.html).digest("hex"), coverage_from: observationDay, coverage_through: `${years.at(-1)}-12-31`, exceptions: exceptions.sort((a,b) => a.date.localeCompare(b.date)) },
    expires_at: new Date(Math.min(Date.parse(weekly.observedAt), Date.parse(closures.observedAt)) + 7 * 86_400_000).toISOString(), places,
  };
  validateOfficialHoursArtifact(artifact);
  return artifact;
}

/** Two fixed public GETs at most, no credentials, retries, redirects, scripts or providers. */
export async function fetchOfficialHoursPage(url: typeof FCPL_HOURS_URL | typeof FCPL_CLOSURES_URL, fetchImpl: typeof fetch = fetch, timeoutMs = 20_000): Promise<OfficialPageReceipt> {
  if (url !== FCPL_HOURS_URL && url !== FCPL_CLOSURES_URL) throw new Error("Unapproved source URL.");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 20_000) throw new Error("Invalid source request deadline.");
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  async function bounded<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([promise, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("FCPL source request deadline exceeded.")); }, Math.max(0, deadline - Date.now()));
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  const response = await bounded(fetchImpl(url, { redirect: "error", signal: controller.signal, headers: { Accept: "text/html" } }));
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html") || !response.body) { controller.abort(); throw new Error(`FCPL source failed (${response.status}).`); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const result = await bounded(reader.read());
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > 256_000) throw new Error("FCPL page exceeds the 256 KB bound.");
      chunks.push(result.value);
    }
  } finally { controller.abort(); void reader.cancel().catch(() => {}); }
  return { url, html: Buffer.concat(chunks).toString("utf8"), observedAt: new Date().toISOString() };
}

/** No-change refreshes may use normal green-check delivery; new facts need review. */
export function officialHoursNeedsReview(previous: unknown, next: OfficialHoursArtifact): boolean {
  try { validateOfficialHoursArtifact(previous); validateOfficialHoursArtifact(next); } catch { return true; }
  function reviewedFacts(artifact: OfficialHoursArtifact) {
    const { expires_at: _expiry, weekly, closures, ...rest } = artifact;
    const { observed_at: _weeklyObserved, sha256: _weeklyHash, ...weeklyFacts } = weekly;
    const { observed_at: _closureObserved, sha256: _closureHash, coverage_from: _coverageFrom, ...closureFacts } = closures;
    void _expiry; void _weeklyObserved; void _weeklyHash; void _closureObserved; void _closureHash; void _coverageFrom;
    return { ...rest, weekly: weeklyFacts, closures: closureFacts };
  }
  return JSON.stringify(reviewedFacts(previous)) !== JSON.stringify(reviewedFacts(next));
}
