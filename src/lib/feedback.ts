/**
 * Pure helpers for the visitor feedback intake. No DB or server-only imports here,
 * so the validation + row-shaping logic is unit-testable; the route handler in
 * src/app/api/feedback/route.ts composes these with the (fail-soft) DB write.
 *
 * Feedback lands in the existing `submissions` table with kind="feedback" — the
 * same intake queue the place/event/claim flows use — so no new migration is
 * needed and /admin already has a place to read it.
 */

/** A single note is capped so a runaway paste can't bloat a jsonb row. */
export const FEEDBACK_MAX_MESSAGE = 4000;
export const FEEDBACK_MAX_PATHNAME = 512;
export const FEEDBACK_MAX_VERSION = 80;
export const FAIR_FEEDBACK_MAX_CONTEXT = 160;
export const FAIR_FEEDBACK_PATHNAME =
  "/moments/great-frederick-fair-2026";

/**
 * A short, fixed vocabulary keeps Fair reports scannable in the owner queue.
 * These are product-report categories, not emergency or official Fair intake.
 */
export const FAIR_FEEDBACK_REASONS = {
  map_wrong: "Map or location",
  schedule_change: "Schedule change",
  parking_entry: "Parking or entry",
  restroom_help: "Restroom or family help",
  access_barrier: "Accessibility barrier",
  other: "Something else",
} as const;

export type FairFeedbackReason = keyof typeof FAIR_FEEDBACK_REASONS;

/**
 * Small, fixed correction vocabulary for Ask Radius. These values are safe to
 * aggregate because they describe the product miss, not the visitor's query.
 * The raw question and answer are deliberately never accepted by this path.
 */
export const ASK_CORRECTION_REASONS = {
  too_far: "Too far away",
  wrong_kind: "Wrong kind",
  hours_wrong: "Hours are wrong",
  closed: "Closed",
  unhelpful: "Not useful",
} as const;

export type AskCorrectionReason = keyof typeof ASK_CORRECTION_REASONS;
export type FeedbackSource = "feedback-widget" | "ask-correction";

// Deliberately simple: catches typos ("a@b", no TLD) without rejecting valid
// unusual addresses. Mirrors /api/beta/email. Email is optional; we only run
// this when the tester actually typed one.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type ParsedFeedbackBase = {
  message: string;
  /** null when the tester left the reply field blank. */
  email: string | null;
  /** The surface the feedback came from, e.g. "/map". */
  pathname: string | null;
  /** Client-supplied build/version label, if the app ever exposes one. */
  version: string | null;
};

export type ParsedFeedback = ParsedFeedbackBase &
  (
    | {
        source: "feedback-widget";
        reason: null;
        resultRef: null;
        fairIssue: FairFeedbackReason | null;
        fairContext: string | null;
      }
    | {
        source: "ask-correction";
        reason: AskCorrectionReason;
        /** Canonical local place/event route, never a query or answer. */
        resultRef: string | null;
        fairIssue: null;
        fairContext: null;
      }
  );

export type ParseResult =
  | { ok: true; value: ParsedFeedback }
  | { ok: false; error: string };

function askCorrectionReason(value: unknown): AskCorrectionReason | null {
  return typeof value === "string" &&
    Object.hasOwn(ASK_CORRECTION_REASONS, value)
    ? (value as AskCorrectionReason)
    : null;
}

export function isFairFeedbackReason(
  value: unknown,
): value is FairFeedbackReason {
  return (
    typeof value === "string" && Object.hasOwn(FAIR_FEEDBACK_REASONS, value)
  );
}

/**
 * Keep correction references useful to the operator without accepting an
 * arbitrary URL or user-entered text. Query strings and fragments are dropped
 * because the canonical entity path is all the data-quality queue needs.
 */
function askCorrectionResultRef(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const match = value
    .trim()
    .match(/^\/(?:places|events)\/[a-z0-9][a-z0-9-]{0,127}(?=[?#]|$)/i);
  return match?.[0] ?? undefined;
}

function askCorrectionMessage(
  reason: AskCorrectionReason,
  resultRef: string | null,
): string {
  const label = ASK_CORRECTION_REASONS[reason];
  return resultRef
    ? `Ask answer marked: ${label}. Result: ${resultRef}.`
    : `Ask answer marked: ${label}.`;
}

/**
 * Validate + normalize a feedback POST body. Pure: shared by the route and the
 * unit test. Guards the cheap abuse vectors the brief calls for — empty check
 * and a hard length cap — and rejects a malformed reply address so a tester who
 * wanted a reply isn't silently unreachable.
 */
export function parseFeedback(raw: unknown): ParseResult {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "invalid-body" };
  const r = raw as Record<string, unknown>;

  const pathname =
    typeof r.pathname === "string" && r.pathname.trim()
      ? r.pathname.trim().slice(0, FEEDBACK_MAX_PATHNAME)
      : null;
  const version =
    typeof r.version === "string" && r.version.trim()
      ? r.version.trim().slice(0, FEEDBACK_MAX_VERSION)
      : null;

  const source: FeedbackSource =
    r.source === "ask-correction" ? "ask-correction" : "feedback-widget";
  const carriesFairMetadata =
    Object.hasOwn(r, "fairIssue") || Object.hasOwn(r, "fairContext");
  if (source !== "feedback-widget" && carriesFairMetadata) {
    return { ok: false, error: "bad-fair-surface" };
  }
  let correction: {
    reason: AskCorrectionReason;
    resultRef: string | null;
  } | null = null;
  let message: string;
  let fairIssue: FairFeedbackReason | null = null;
  let fairContext: string | null = null;

  if (source === "ask-correction") {
    const reason = askCorrectionReason(r.reason);
    if (!reason) return { ok: false, error: "bad-reason" };
    const parsedResultRef = askCorrectionResultRef(r.resultRef);
    if (parsedResultRef === undefined) {
      return { ok: false, error: "bad-result-ref" };
    }
    correction = { reason, resultRef: parsedResultRef };
    message = askCorrectionMessage(reason, parsedResultRef);
  } else {
    message = typeof r.message === "string" ? r.message.trim() : "";
    if (!message) return { ok: false, error: "empty" };
    if (message.length > FEEDBACK_MAX_MESSAGE) return { ok: false, error: "too-long" };

    if (pathname === FAIR_FEEDBACK_PATHNAME || carriesFairMetadata) {
      if (pathname !== FAIR_FEEDBACK_PATHNAME) {
        return { ok: false, error: "bad-fair-surface" };
      }
      if (!isFairFeedbackReason(r.fairIssue)) {
        return { ok: false, error: "bad-fair-issue" };
      }
      fairIssue = r.fairIssue;

      if (r.fairContext != null && r.fairContext !== "") {
        if (typeof r.fairContext !== "string") {
          return { ok: false, error: "bad-fair-context" };
        }
        const normalizedContext = r.fairContext.replace(/\s+/g, " ").trim();
        if (normalizedContext.length > FAIR_FEEDBACK_MAX_CONTEXT) {
          return { ok: false, error: "fair-context-too-long" };
        }
        fairContext = normalizedContext || null;
      }
    }
  }

  const rawEmail =
    typeof r.email === "string" ? r.email.trim().toLowerCase().slice(0, 254) : "";
  let email: string | null = null;
  if (rawEmail) {
    if (!EMAIL_RE.test(rawEmail)) return { ok: false, error: "bad-email" };
    email = rawEmail;
  }

  return correction
    ? {
        ok: true,
        value: {
          message,
          email,
          pathname,
          version,
          source: "ask-correction",
          reason: correction.reason,
          resultRef: correction.resultRef,
          fairIssue: null,
          fairContext: null,
        },
      }
    : {
        ok: true,
        value: {
          message,
          email,
          pathname,
          version,
          source: "feedback-widget",
          reason: null,
          resultRef: null,
          fairIssue,
          fairContext,
        },
      };
}

/** The exact object handed to `db.insert(submissions)`. Kept as a typed shape
 *  so the write is unit-testable without a database. */
export type FeedbackRow = {
  kind: "feedback";
  payload: {
    message: string;
    pathname: string | null;
    version: string | null;
    /** Server-stamped deploy SHA (VERCEL_GIT_COMMIT_SHA), the reliable one. */
    commit: string | null;
    source: FeedbackSource;
    reason?: AskCorrectionReason;
    result_ref?: string | null;
    fair_issue?: FairFeedbackReason;
    fair_context?: string | null;
  };
  submitter_email: string | null;
};

/**
 * Shape a parsed note into the `submissions` insert values. The commit is
 * stamped server-side (the client can't read VERCEL_GIT_COMMIT_SHA), so an
 * admin can tie a report to the exact build without trusting client input.
 */
export function buildFeedbackRow(value: ParsedFeedback, commit: string | null): FeedbackRow {
  return {
    kind: "feedback",
    payload: {
      message: value.message,
      pathname: value.pathname,
      version: value.version,
      commit: commit && commit.trim() ? commit.trim().slice(0, 64) : null,
      source: value.source,
      ...(value.source === "ask-correction"
        ? { reason: value.reason, result_ref: value.resultRef }
        : value.fairIssue
          ? {
              fair_issue: value.fairIssue,
              fair_context: value.fairContext,
            }
          : {}),
    },
    submitter_email: value.email,
  };
}

const FAIR_OWNER_ALERT_TITLES: Record<FairFeedbackReason, string> = {
  map_wrong: "Fair map or location report",
  schedule_change: "Fair schedule report",
  parking_entry: "Fair parking or entry report",
  restroom_help: "Fair restroom or family report",
  access_barrier: "Fair accessibility report",
  other: "Fair visitor report",
};

export const FEEDBACK_OWNER_ALERT_MAX_BODY = 160;

function boundedAlertBody(value: string): string {
  if (value.length <= FEEDBACK_OWNER_ALERT_MAX_BODY) return value;
  return `${value.slice(0, FEEDBACK_OWNER_ALERT_MAX_BODY - 1).trimEnd()}…`;
}

/** Keeps the phone alert useful while leaving the durable, full note in admin. */
export function buildFeedbackOwnerAlert(value: ParsedFeedback): {
  title: string;
  body: string;
} {
  if (value.source === "ask-correction") {
    return {
      title: "Ask correction",
      body: boundedAlertBody(value.message),
    };
  }

  if (value.fairIssue) {
    return {
      title: FAIR_OWNER_ALERT_TITLES[value.fairIssue],
      body: boundedAlertBody(
        [value.fairContext, value.message].filter(Boolean).join(" · "),
      ),
    };
  }

  const where = value.pathname ? ` · ${value.pathname}` : "";
  return {
    title: "Site feedback",
    body: boundedAlertBody(`${value.message}${where}`),
  };
}
