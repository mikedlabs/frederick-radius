/**
 * Pure helpers for the beta feedback intake. No DB or server-only imports here,
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

// Deliberately simple: catches typos ("a@b", no TLD) without rejecting valid
// unusual addresses. Mirrors /api/beta/email. Email is optional; we only run
// this when the tester actually typed one.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type ParsedFeedback = {
  message: string;
  /** null when the tester left the reply field blank. */
  email: string | null;
  /** The surface the feedback came from, e.g. "/map". */
  pathname: string | null;
  /** Client-supplied build/version label, if the app ever exposes one. */
  version: string | null;
};

export type ParseResult =
  | { ok: true; value: ParsedFeedback }
  | { ok: false; error: string };

/**
 * Validate + normalize a feedback POST body. Pure: shared by the route and the
 * unit test. Guards the cheap abuse vectors the brief calls for — empty check
 * and a hard length cap — and rejects a malformed reply address so a tester who
 * wanted a reply isn't silently unreachable.
 */
export function parseFeedback(raw: unknown): ParseResult {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "invalid-body" };
  const r = raw as Record<string, unknown>;

  const message = typeof r.message === "string" ? r.message.trim() : "";
  if (!message) return { ok: false, error: "empty" };
  if (message.length > FEEDBACK_MAX_MESSAGE) return { ok: false, error: "too-long" };

  const rawEmail =
    typeof r.email === "string" ? r.email.trim().toLowerCase().slice(0, 254) : "";
  let email: string | null = null;
  if (rawEmail) {
    if (!EMAIL_RE.test(rawEmail)) return { ok: false, error: "bad-email" };
    email = rawEmail;
  }

  const pathname =
    typeof r.pathname === "string" && r.pathname.trim()
      ? r.pathname.trim().slice(0, FEEDBACK_MAX_PATHNAME)
      : null;
  const version =
    typeof r.version === "string" && r.version.trim()
      ? r.version.trim().slice(0, FEEDBACK_MAX_VERSION)
      : null;

  return { ok: true, value: { message, email, pathname, version } };
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
    source: "beta-widget";
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
      source: "beta-widget",
    },
    submitter_email: value.email,
  };
}
