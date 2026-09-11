import "server-only";

/**
 * The weekly business digest — the growth rail.
 *
 * The app already tracks health (nightly gates → GitHub issues) and
 * behavior (Plausible events); nothing read them as a BUSINESS each
 * week. This builds one Monday summary from the Plausible Stats API —
 * visitors, views, top pages, top events, week-over-week movement —
 * and delivers it on the channel the owner already checks (a GitHub
 * issue, same as the health alerts).
 *
 * Fail-soft by design: without PLAUSIBLE_API_KEY + PLAUSIBLE_SITE_ID
 * the digest still posts, saying exactly which key unlocks the rest —
 * a nudge on the right channel beats silence.
 */
const API = "https://plausible.io/api/v1/stats";

type Aggregate = { visitors?: { value: number }; pageviews?: { value: number }; visit_duration?: { value: number } };
type BreakdownRow = { page?: string; name?: string; visitors: number };

async function plausible(path: string, key: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function pct(now: number, prev: number): string {
  if (prev <= 0) return now > 0 ? "new" : "flat";
  const delta = Math.round(((now - prev) / prev) * 100);
  if (delta === 0) return "flat";
  return `${delta > 0 ? "up" : "down"} ${Math.abs(delta)}%`;
}

export async function buildWeeklyDigestBody(now: Date = new Date()): Promise<string> {
  const key = process.env.PLAUSIBLE_API_KEY;
  const site = process.env.PLAUSIBLE_SITE_ID;
  const lines: string[] = [];
  const week = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(now);
  lines.push(`Weekly numbers for frederickradius.app, week ending ${week}.`, "");

  if (!key || !site) {
    lines.push(
      "Traffic and goal numbers are available in the Plausible dashboard.",
      "This automated digest needs Plausible Business because Starter does not include the Stats API.",
      "If the plan is upgraded, add `PLAUSIBLE_API_KEY` and `PLAUSIBLE_SITE_ID` in Vercel.",
    );
    return lines.join("\n");
  }

  const q = `site_id=${encodeURIComponent(site)}`;
  const [cur, prev, pages, events] = await Promise.all([
    plausible(`/aggregate?${q}&period=7d&metrics=visitors,pageviews,visit_duration`, key) as Promise<{ results?: Aggregate } | null>,
    plausible(`/aggregate?${q}&period=7d&date=${new Date(now.getTime() - 7 * 864e5).toISOString().slice(0, 10)}&metrics=visitors,pageviews`, key) as Promise<{ results?: Aggregate } | null>,
    plausible(`/breakdown?${q}&period=7d&property=event:page&limit=5`, key) as Promise<{ results?: BreakdownRow[] } | null>,
    plausible(`/breakdown?${q}&period=7d&property=event:name&limit=8`, key) as Promise<{ results?: BreakdownRow[] } | null>,
  ]);

  const c = cur?.results;
  const p = prev?.results;
  if (!c?.visitors) {
    lines.push("Plausible did not answer this run. The keys are set; likely transient — next week retries.");
    return lines.join("\n");
  }
  const visitors = c.visitors.value;
  const views = c.pageviews?.value ?? 0;
  const mins = Math.round((c.visit_duration?.value ?? 0) / 60);
  lines.push(
    `**Visitors:** ${visitors} (${pct(visitors, p?.visitors?.value ?? 0)} vs prior week)`,
    `**Views:** ${views} (${pct(views, p?.pageviews?.value ?? 0)})`,
    `**Median visit:** about ${mins} min`,
    "",
  );
  const topPages = (pages?.results ?? []).filter((r) => r.page);
  if (topPages.length > 0) {
    lines.push("**Top pages**", ...topPages.map((r) => `- ${r.page} · ${r.visitors}`), "");
  }
  const topEvents = (events?.results ?? []).filter((r) => r.name && r.name !== "pageview");
  if (topEvents.length > 0) {
    lines.push("**Top actions**", ...topEvents.map((r) => `- ${r.name} · ${r.visitors}`), "");
  }
  lines.push("_Numbers are Plausible aggregates; no personal data is collected._");
  return lines.join("\n");
}
