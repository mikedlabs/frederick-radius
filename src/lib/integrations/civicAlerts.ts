/**
 * Curated civic advisories — the human channel for hyper-local road work,
 * closures, and emergency notices the automated feeds miss.
 *
 * Two sources feed it, both shaped as `CivicPressItem` so they merge straight
 * into Pulse's "Road work & closures" card with zero new UI:
 *   1. The `civic_alerts` DB table — the live, admin-postable channel
 *      (POST /api/civic-alerts, admin-gated). This is the primary path.
 *   2. `src/data/civic-alerts.json` — a static fallback + seed for
 *      deployments without a DB (e.g. preview builds).
 *
 * Honest by construction: every entry carries a window, and an alert is only
 * emitted while `startsAt <= now <= expiresAt`. A past event simply stops
 * rendering, so no stale "emergency" ever ships even if nobody prunes it.
 * Authored copy follows the house voice (no em dashes).
 *
 * Note on scope: the live City/County News Flash RSS is ALREADY ingested and
 * classified as advisories in civic-press.ts (its ADVISORY_RE matches "road
 * closure", "water main", "detour", ...). This channel is only for what the
 * City has NOT published to that feed.
 */
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import RAW from "@/data/civic-alerts.json" with { type: "json" };
import { getDb } from "@/lib/db/client";
import { civicAlerts } from "@/lib/db/schema";
import type { CivicPressItem } from "./civic-press";

export type CuratedAlert = {
  id: string;
  title: string;
  source: CivicPressItem["source"];
  url: string;
  startsAt: string;
  expiresAt: string;
};

const ALERTS: CuratedAlert[] = (RAW as { alerts?: CuratedAlert[] }).alerts ?? [];

function sourceShort(source: CivicPressItem["source"]): CivicPressItem["sourceShort"] {
  return source === "Frederick County" ? "County" : "City";
}

function toItem(a: {
  title: string;
  url: string;
  source: CivicPressItem["source"];
  publishedAt: string;
}): CivicPressItem {
  return {
    title: a.title,
    url: a.url,
    source: a.source,
    sourceShort: sourceShort(a.source),
    publishedAt: a.publishedAt,
    lane: "advisory" as const,
  };
}

/**
 * Active curated advisories from the STATIC file, newest-window first.
 * `now` and `alerts` are injectable so the function stays pure + testable.
 */
export function getCuratedAdvisories(
  now: number,
  alerts: CuratedAlert[] = ALERTS,
): CivicPressItem[] {
  return alerts
    .filter((a) => {
      const start = Date.parse(a.startsAt);
      const end = Date.parse(a.expiresAt);
      if (Number.isNaN(start) || Number.isNaN(end)) return false;
      return start <= now && now <= end;
    })
    .map((a) => toItem({ title: a.title, url: a.url, source: a.source, publishedAt: a.startsAt }))
    .sort((x, y) => Date.parse(y.publishedAt) - Date.parse(x.publishedAt));
}

/**
 * Active rows from the DB channel — the `civic_alerts` table (present since
 * migration 0000, wired up here). Active = is_active, ends_at in the future,
 * and started. Best-effort: any failure (or no DB) → [].
 */
async function getDbAdvisories(now: number): Promise<CivicPressItem[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const when = new Date(now);
    const rows = await db
      .select({
        id: civicAlerts.id,
        title: civicAlerts.title,
        link: civicAlerts.link,
        source: civicAlerts.source,
        starts_at: civicAlerts.starts_at,
      })
      .from(civicAlerts)
      .where(
        and(
          eq(civicAlerts.is_active, true),
          gt(civicAlerts.ends_at, when),
          or(isNull(civicAlerts.starts_at), lte(civicAlerts.starts_at, when)),
        ),
      )
      .limit(20);
    return rows
      .map((r) =>
        toItem({
          title: r.title,
          // AdvisoryCard keys + links on url; fall back to the City alert hub.
          url: r.link ?? `https://www.cityoffrederickmd.gov/CivicAlerts.aspx#${r.id}`,
          source: r.source === "Frederick County" ? "Frederick County" : "City of Frederick",
          publishedAt: (r.starts_at ?? new Date(now)).toISOString(),
        }),
      )
      .sort((x, y) => Date.parse(y.publishedAt) - Date.parse(x.publishedAt));
  } catch {
    return [];
  }
}

/**
 * The combined active advisory set (DB channel first, then the static
 * fallback), deduped by url. This is what Pulse renders.
 */
export async function getActiveAdvisories(now: number): Promise<CivicPressItem[]> {
  const [dbItems, fileItems] = [await getDbAdvisories(now), getCuratedAdvisories(now)];
  const seen = new Set<string>();
  const out: CivicPressItem[] = [];
  for (const item of [...dbItems, ...fileItems]) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

// ── Admin POST validation (pure; the route does auth + persistence) ──────────

const SEVERITIES = new Set(["info", "advisory", "warning", "emergency"]);
const SOURCES = new Set(["City of Frederick", "Frederick County"]);

/** Shaped to the existing `civic_alerts` columns (link, ends_at, is_active). */
export type CivicAlertInput = {
  title: string;
  body: string | null;
  severity: string;
  source: CivicPressItem["source"];
  link: string | null;
  starts_at: Date;
  ends_at: Date;
};

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Validate + normalize a POST /api/civic-alerts body. Mirrors the
 * business-updates parser: pure, length-clamped, and it REQUIRES a future
 * `expiresAt` so the self-expiry guarantee can't be bypassed.
 */
export function parseCivicAlertBody(
  raw: unknown,
  now: number = Date.now(),
): { ok: true; value: CivicAlertInput } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "invalid-body" };
  const r = raw as Record<string, unknown>;

  const title = clampStr(r.title, 200);
  if (!title || title.length < 4) return { ok: false, error: "title-required" };

  const expMs = typeof r.expiresAt === "string" ? Date.parse(r.expiresAt) : NaN;
  if (Number.isNaN(expMs)) return { ok: false, error: "expiresAt-required" };
  if (expMs <= now) return { ok: false, error: "expiresAt-must-be-future" };

  const startMs = typeof r.startsAt === "string" ? Date.parse(r.startsAt) : now;
  if (Number.isNaN(startMs)) return { ok: false, error: "startsAt-invalid" };

  const severity = typeof r.severity === "string" && SEVERITIES.has(r.severity) ? r.severity : "advisory";
  const source: CivicPressItem["source"] =
    typeof r.source === "string" && SOURCES.has(r.source)
      ? (r.source as CivicPressItem["source"])
      : "City of Frederick";

  const link = clampStr(r.url, 500);
  if (link && !/^https?:\/\//i.test(link)) return { ok: false, error: "url-invalid" };

  return {
    ok: true,
    value: {
      title,
      body: clampStr(r.body, 600),
      severity,
      source,
      link,
      starts_at: new Date(startMs),
      ends_at: new Date(expMs),
    },
  };
}
