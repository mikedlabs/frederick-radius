import "server-only";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { placeHoursRefresh } from "@/lib/db/schema";
import { withStatementTimeout } from "@/lib/db/statement-timeout";
import type { LivePlaceEvidence } from "@/lib/live-place-evidence";

export const MAX_LIVE_PLACE_EVIDENCE_SLUGS = 150;
export const LIVE_PLACE_EVIDENCE_TIMEOUT_MS = 650;
export const LIVE_PLACE_EVIDENCE_STATEMENT_TIMEOUT_MS = 500;

function boundedSlugs(slugs: readonly string[]): string[] {
  return [...new Set(slugs)]
    .filter((slug) => slug.length > 0 && slug.length <= 120)
    .slice(0, MAX_LIVE_PLACE_EVIDENCE_SLUGS);
}

/**
 * Read current place evidence without making a provider request. Missing DB
 * configuration, an unapplied migration, a timeout, or any query failure all
 * resolve to an empty map so the checked-in stale-good snapshot remains the
 * response. The public route cache prevents this from becoming a hot query.
 */
export async function loadLivePlaceEvidence(
  slugs: readonly string[],
  timeoutMs: number = LIVE_PLACE_EVIDENCE_TIMEOUT_MS,
): Promise<Map<string, LivePlaceEvidence>> {
  const requested = boundedSlugs(slugs);
  const db = getDb();
  if (!db || requested.length === 0) return new Map();

  // The caller deadline prevents a slow optional read from delaying the
  // response. The database deadline matters just as much: Promise.race alone
  // would leave timed-out SQL running behind the response and occupying the
  // one-connection Supavisor pool.
  const statementTimeoutMs = Math.max(
    1,
    Math.min(timeoutMs, LIVE_PLACE_EVIDENCE_STATEMENT_TIMEOUT_MS),
  );
  const pending = withStatementTimeout(
    db,
    statementTimeoutMs,
    (executor) =>
      executor
        .select({
          slug: placeHoursRefresh.slug,
          placeId: placeHoursRefresh.placeId,
          weekdayHours: placeHoursRefresh.weekdayHours,
          businessStatus: placeHoursRefresh.businessStatus,
          refreshedAt: placeHoursRefresh.refreshedAt,
        })
        .from(placeHoursRefresh)
        .where(inArray(placeHoursRefresh.slug, requested)),
  ).then(
    (rows) => ({ status: "ok" as const, rows }),
    () => ({ status: "failed" as const }),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timed = new Promise<{ status: "timeout" }>((resolve) => {
    timer = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
  });

  try {
    const result = await Promise.race([pending, timed]);
    if (result.status !== "ok") return new Map();

    return new Map(
      result.rows.map((row) => [
        row.slug,
        {
          slug: row.slug,
          placeId: row.placeId,
          weekdayHours: row.weekdayHours,
          businessStatus: row.businessStatus,
          observedAt: row.refreshedAt.toISOString(),
        },
      ]),
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
