/**
 * Answer coverage — does the app actually answer the questions people ask?
 *
 * The 2026-07-30 answer audit drove the real answer stack with a generated
 * persona corpus and found the holes that unit tests cannot see: a query that
 * returns *results* but not the *answer* still passes every existing test. That
 * harness lived in a session scratchpad and was lost, so the 87.1% it reported
 * could never be re-measured or defended against regression.
 *
 * This is that harness, in the repo. It drives the SAME three sources
 * `SearchOverlay` calls, in the same order a reader sees them:
 *
 *   1. `findQuickAnswers()`   — quick-route intents (open now, events, transit)
 *   2. `findDepartments()`    — buried government, gated exactly as the overlay
 *      + `searchCivicActions()` — the county's own How-Do-I corpus
 *   3. `qualifiedSearchIndex()` — ranked places, events, towns, categories
 *
 * Each need carries a machine-checkable expectation, so a verdict is a fact
 * about the shipped stack, not a reviewer's opinion. Verdicts follow the
 * original audit so the numbers stay comparable:
 *
 *   PASS  the expected answer is in the top 3   (the reader sees it)
 *   WEAK  it is in positions 4-12               (they have to hunt)
 *   FAIL  answers came back, none of them right (confidently unhelpful)
 *   EMPTY nothing came back at all
 *
 * `knownGap` marks a need the catalog genuinely cannot answer yet because the
 * verified data does not exist. Those are excluded from the headline score and
 * reported separately, so a data hole is never quietly scored as a code
 * failure — and never silently forgiven either.
 */

import type { Event } from "@/data/events";
// NOTE: `src/lib/search.ts` (the ranking engine) shadows this directory, so
// `@/lib/search` does NOT resolve here. The adapter layer must be imported by
// its explicit path, exactly as SearchOverlay and the /api/search route do.
import { qualifiedSearchIndex, type SearchResult } from "@/lib/search/index";
import { searchCivicActions, shouldShowDepartmentAnswers } from "@/lib/search/civic";
import { findQuickAnswers } from "@/lib/answers/intents";
import { findDepartments } from "@/data/departments";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";

// ── Expectations ────────────────────────────────────────────────────────────

export type CoverageExpectation =
  /** A place row, optionally constrained to satisfying categories/name. */
  | { kind: "place"; categories?: readonly string[]; title?: RegExp }
  /** A buried-government department card. */
  | { kind: "department"; slug?: string }
  /** Any answer whose destination matches (a surface, guide, or official link). */
  | { kind: "href"; pattern: RegExp }
  /** Any answer whose visible title matches. */
  | { kind: "title"; pattern: RegExp };

export type CoverageNeed = {
  /** Who is asking. Groups the report. */
  persona: string;
  /** The need in the words a person actually uses. */
  need: string;
  /** Which phrasing templates to expand this need through. */
  phrasings?: readonly PhrasingKey[];
  expect: CoverageExpectation;
  /**
   * Set when no verified row exists to answer this yet. Excluded from the
   * headline, reported as a data gap. The string says what is missing.
   */
  knownGap?: string;
};

// ── Phrasings ───────────────────────────────────────────────────────────────

/**
 * How people actually type. The audit's finding was that the catalog is filed
 * under category slugs and Google-derived names, and people speak neither — so
 * a need must survive several phrasings, not just its canonical noun.
 */
export const PHRASINGS = {
  bare: (n: string) => n,
  nearMe: (n: string) => `${n} near me`,
  whereCanI: (n: string) => `where can i get ${n}`,
  best: (n: string) => `best ${n} in frederick`,
  iNeed: (n: string) => `i need ${n}`,
  closest: (n: string) => `closest ${n}`,
  whereIs: (n: string) => `where is ${n}`,
} as const;

export type PhrasingKey = keyof typeof PHRASINGS;

/** The default set applied to a need that does not name its own. */
export const DEFAULT_PHRASINGS: readonly PhrasingKey[] = ["bare", "nearMe", "whereCanI"];

// ── The combined answer list ────────────────────────────────────────────────

/** One row as the reader sees it, whichever source produced it. */
export type AnswerRow = {
  source: "quick" | "civic" | "department" | "ranked";
  title: string;
  href: string;
  /** Place category, resolved from the catalog for ranked place rows. */
  category?: string;
  /** Department slug, for department rows. */
  slug?: string;
  resultType?: SearchResult["type"];
};

/**
 * Reproduce the overlay's answer order for a query. `SearchOverlay` renders
 * quick answers, then gated department cards, then civic actions, then the
 * ranked results — so the "top 3" a reader sees spans all four.
 */
export function answerRowsFor(
  query: string,
  eventPool?: readonly Event[],
  limit = 12,
): AnswerRow[] {
  const rows: AnswerRow[] = [];

  for (const q of findQuickAnswers(query)) {
    rows.push({ source: "quick", title: q.title, href: q.href });
  }

  const civicCandidates = searchCivicActions(query, 2);
  const govAnswers = shouldShowDepartmentAnswers(query, civicCandidates)
    ? findDepartments(query)
    : [];
  for (const d of govAnswers) {
    rows.push({ source: "department", title: d.name, href: d.website, slug: d.slug });
  }
  // The overlay drops a civic action that merely repeats a department card.
  for (const c of civicCandidates) {
    if (govAnswers.some((d) => d.website === c.href)) continue;
    rows.push({ source: "civic", title: c.title, href: c.href });
  }

  const { results } = qualifiedSearchIndex(query, limit, eventPool);
  for (const r of results) {
    rows.push({
      source: "ranked",
      title: r.title,
      href: r.href,
      resultType: r.type,
      category: categoryOf(r),
    });
  }

  return rows;
}

/** Resolve a ranked place row back to its catalog category. */
function categoryOf(result: SearchResult): string | undefined {
  if (result.type !== "place") return undefined;
  const slug = result.href.startsWith("/places/") ? result.href.slice("/places/".length) : "";
  if (!slug) return undefined;
  return clientPlaceBySlug(slug)?.category;
}

// ── Verdicts ────────────────────────────────────────────────────────────────

export type Verdict = "PASS" | "WEAK" | "FAIL" | "EMPTY";

export function rowSatisfies(row: AnswerRow, expect: CoverageExpectation): boolean {
  switch (expect.kind) {
    case "place":
      if (row.source !== "ranked" || row.resultType !== "place") return false;
      if (expect.categories && !expect.categories.includes(row.category ?? "")) return false;
      if (expect.title && !expect.title.test(row.title)) return false;
      return true;
    case "department":
      if (row.source !== "department") return false;
      return expect.slug ? row.slug === expect.slug : true;
    case "href":
      return expect.pattern.test(row.href);
    case "title":
      return expect.pattern.test(row.title);
  }
}

export type QueryOutcome = {
  query: string;
  verdict: Verdict;
  /** 1-based position of the satisfying row, when there is one. */
  position?: number;
  /** How many rows came back at all. */
  rowCount: number;
};

export function evaluateQuery(
  query: string,
  expect: CoverageExpectation,
  eventPool?: readonly Event[],
): QueryOutcome {
  const rows = answerRowsFor(query, eventPool);
  if (rows.length === 0) return { query, verdict: "EMPTY", rowCount: 0 };
  const idx = rows.findIndex((r) => rowSatisfies(r, expect));
  if (idx === -1) return { query, verdict: "FAIL", rowCount: rows.length };
  const position = idx + 1;
  return {
    query,
    verdict: position <= 3 ? "PASS" : position <= 12 ? "WEAK" : "FAIL",
    position,
    rowCount: rows.length,
  };
}

export type NeedOutcome = {
  need: CoverageNeed;
  outcomes: QueryOutcome[];
  /** The need's worst verdict — a need is only as good as its weakest phrasing. */
  verdict: Verdict;
};

const SEVERITY: Record<Verdict, number> = { PASS: 0, WEAK: 1, FAIL: 2, EMPTY: 3 };

export function evaluateNeed(need: CoverageNeed, eventPool?: readonly Event[]): NeedOutcome {
  const keys = need.phrasings ?? DEFAULT_PHRASINGS;
  const outcomes = keys.map((k) => evaluateQuery(PHRASINGS[k](need.need), need.expect, eventPool));
  const verdict = outcomes.reduce<Verdict>(
    (worst, o) => (SEVERITY[o.verdict] > SEVERITY[worst] ? o.verdict : worst),
    "PASS",
  );
  return { need, outcomes, verdict };
}

export type CoverageReport = {
  /** Needs the catalog is expected to answer today (knownGap excluded). */
  scored: NeedOutcome[];
  /** Needs blocked on verified data that does not exist yet. */
  gaps: NeedOutcome[];
  tally: Record<Verdict, number>;
  /** Share of scored needs whose every phrasing lands in the top 3. */
  passRate: number;
  byPersona: { persona: string; pass: number; total: number }[];
};

export function runCoverage(
  needs: readonly CoverageNeed[],
  eventPool?: readonly Event[],
): CoverageReport {
  const all = needs.map((n) => evaluateNeed(n, eventPool));
  const scored = all.filter((o) => !o.need.knownGap);
  const gaps = all.filter((o) => o.need.knownGap);

  const tally: Record<Verdict, number> = { PASS: 0, WEAK: 0, FAIL: 0, EMPTY: 0 };
  for (const o of scored) tally[o.verdict] += 1;

  const personas = [...new Set(scored.map((o) => o.need.persona))];
  const byPersona = personas.map((persona) => {
    const rows = scored.filter((o) => o.need.persona === persona);
    return {
      persona,
      pass: rows.filter((o) => o.verdict === "PASS").length,
      total: rows.length,
    };
  });

  return {
    scored,
    gaps,
    tally,
    passRate: scored.length ? tally.PASS / scored.length : 1,
    byPersona,
  };
}
