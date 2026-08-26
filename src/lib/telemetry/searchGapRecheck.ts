/**
 * Recheck a historical search miss against the current deterministic answer
 * stack.
 *
 * A row in `search_misses` proves only that Radius did not answer the query at
 * the time it was logged. It is not a durable statement that the current build
 * is still broken. Conversely, a loose result today is not proof that the
 * user's need has been solved. These deliberately cautious states preserve
 * both truths for the admin review queue.
 */
import type { Event } from "@/data/events";
import { isEventSearchIntent } from "@/lib/search";
import {
  answerRowsFor,
  type AnswerRow,
} from "@/lib/search/coverage";
import type { MissKind } from "@/lib/telemetry/searchMiss";

export type SearchGapReviewStatus =
  | "candidate-to-verify"
  | "still-empty"
  | "recheck-incomplete"
  | "ask-needs-retest";

export type SearchGapRecheck = {
  status: SearchGapReviewStatus;
  /** Number of deterministic rows available in the current build. */
  candidateCount: number;
  /** A review lead, never an assertion that the original need is solved. */
  lead: Pick<AnswerRow, "title" | "href" | "source"> | null;
};

/**
 * Prefer a concrete entity or official civic answer over a broad category
 * door when giving the owner one row to inspect. This changes only the review
 * hint; it does not change public ranking.
 */
function reviewLead(rows: readonly AnswerRow[]): AnswerRow | null {
  return (
    rows.find(
      (row) =>
        row.source === "department" ||
        row.source === "civic" ||
        (row.source === "ranked" &&
          (row.resultType === "place" || row.resultType === "event")),
    ) ??
    rows[0] ??
    null
  );
}

export function recheckHistoricalSearchMiss(
  query: string,
  kind: MissKind,
  eventPool?: readonly Event[],
  options: { eventArchiveDegraded?: boolean } = {},
): SearchGapRecheck {
  // Ask can use retrieval, weather, location, and generated reasoning beyond
  // the deterministic search rows. Do not call an Ask miss fixed without
  // actually rerunning that full path in an intentional review session.
  if (kind === "ask") {
    return { status: "ask-needs-retest", candidateCount: 0, lead: null };
  }

  // A route into Events is not proof that the live event answer exists. When
  // the archive is degraded, do not classify an event-intent query from a
  // partial corpus at all.
  if (options.eventArchiveDegraded && isEventSearchIntent(query)) {
    return { status: "recheck-incomplete", candidateCount: 0, lead: null };
  }

  const rows = answerRowsFor(query, eventPool, 12);
  if (rows.length === 0) {
    return { status: "still-empty", candidateCount: 0, lead: null };
  }

  const lead = reviewLead(rows);
  return {
    status: "candidate-to-verify",
    candidateCount: rows.length,
    lead: lead
      ? { title: lead.title, href: lead.href, source: lead.source }
      : null,
  };
}
