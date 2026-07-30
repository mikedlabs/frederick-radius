"use server";

import { headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";
import { sendAdminEmail } from "@/lib/notify/adminEmail";
import {
  isRateLimited,
  isSameOriginMutationRequest,
} from "@/lib/origin-check";
import {
  type PublicSubmissionProof,
  validateClaimSubmission,
  validateEventSubmission,
  validatePlaceSubmission,
} from "./submission-validation";

export type SubmitPlaceInput = PublicSubmissionProof & {
  name: string;
  category: string;
  address: string;
  municipality: string;
  website: string;
  phone: string;
  description: string;
  social_url: string;
  photo_url: string;
  photo_permission: boolean;
  submitter_email: string;
  submitter_name: string;
  is_owner: boolean;
};

export type SubmitEventInput = PublicSubmissionProof & {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  venue_name: string;
  address: string;
  municipality: string;
  category: string;
  is_free: boolean;
  price_text: string;
  ticket_url: string;
  organizer: string;
  photo_url: string;
  photo_permission: boolean;
  submitter_email: string;
  submitter_name: string;
};

type SubmissionKind = "place" | "event" | "business_claim";

type SubmissionMeta = {
  submitter_name: string;
  submitter_email: string;
  place_slug: string | null;
};

type SubmissionFailure = {
  ok: false;
  message: string;
  retryable: boolean;
};

export type SubmissionActionResult =
  | { ok: true; token: string }
  | SubmissionFailure;

const PUBLIC_SUBMISSION_LIMIT = 6;
const PUBLIC_SUBMISSION_WINDOW_SECONDS = 15 * 60;
const DELIVERY_FAILURE_MESSAGE =
  "We couldn’t save this submission. Your details are still in the form, so wait a moment and try again.";

function submissionFailure(
  message: string,
  retryable: boolean,
): SubmissionFailure {
  return { ok: false, message, retryable };
}

async function currentSubmissionRequest(): Promise<Request | null> {
  const requestHeaders = await headers();
  // Match the host preference Next itself uses behind a trusted proxy. The
  // reconstructed Request is never fetched; it exists only so the shared
  // origin/IP guards can inspect the real Server Action request headers.
  const host =
    requestHeaders
      .get("x-forwarded-host")
      ?.split(",", 1)[0]
      ?.trim() || requestHeaders.get("host")?.trim();
  if (!host) return null;

  const hostname = host.split(":", 1)[0]?.toLowerCase();
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0";
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    ?.trim()
    .toLowerCase();
  const protocol = isLocal
    ? forwardedProtocol === "https"
      ? "https"
      : "http"
    : "https";

  try {
    return new Request(`${protocol}://${host}/__public-submission`, {
      method: "POST",
      headers: new Headers(requestHeaders),
    });
  } catch {
    return null;
  }
}

async function verifyPublicSubmissionOrigin(): Promise<
  | { ok: true; request: Request }
  | { ok: false; failure: SubmissionFailure }
> {
  const request = await currentSubmissionRequest();
  if (!request || !isSameOriginMutationRequest(request)) {
    return {
      ok: false,
      failure: submissionFailure(
        "We couldn’t verify this submission. Refresh the page and try again.",
        true,
      ),
    };
  }

  return { ok: true, request };
}

async function publicSubmissionRateLimit(
  request: Request,
): Promise<SubmissionFailure | null> {
  if (
    await isRateLimited(
      request,
      "public-submission",
      PUBLIC_SUBMISSION_LIMIT,
      PUBLIC_SUBMISSION_WINDOW_SECONDS,
    )
  ) {
    return submissionFailure(
      "You’ve sent several submissions. Wait a few minutes and try again.",
      true,
    );
  }

  return null;
}

function botAcceptedToken(): SubmissionActionResult {
  // Do not teach automated form fillers which tripwire they hit. The UI can
  // show its normal thank-you state, but no row, email, trace, or durable
  // capability token is created.
  return { ok: true, token: crypto.randomUUID() };
}

/**
 * Persist a submission. Writes a row to the `submissions` table when a
 * database is configured, then emails the admin as a second delivery path.
 * Production reports success only when at least one durable channel accepts
 * the submission. Local development may fall back to a warning so UI work
 * does not require production credentials.
 *
 * The token is a capability credential, so neither it nor submitter contact
 * details are written to application logs.
 */
async function persistSubmission(
  kind: SubmissionKind,
  payload: Record<string, unknown>,
  meta: SubmissionMeta,
): Promise<SubmissionActionResult> {
  const token = crypto.randomUUID();
  let stored = false;

  try {
    const db = getDb();
    if (db) {
      await db.insert(submissions).values({
        kind,
        payload,
        place_slug: meta.place_slug,
        submitter_name: meta.submitter_name || null,
        submitter_email: meta.submitter_email || null,
      });
      stored = true;
    }
  } catch (err) {
    console.error(
      `[submission] DB write failed (${err instanceof Error ? err.name : "unknown error"}); trying the email fallback.`,
    );
  }

  const emailed = await maybeSendAdminEmail(kind, payload);
  if (!stored && !emailed) {
    if (process.env.NODE_ENV !== "production") {
      // Local UI work should not require production DB/email credentials. The
      // warning keeps this state explicit while production remains truthful.
      console.warn(
        `[submission] ${kind} accepted only as a local development fallback; no durable delivery is configured.`,
      );
      return { ok: true, token };
    }
    console.error(
      `[submission] ${kind} was not delivered to the database or admin inbox.`,
    );
    return submissionFailure(DELIVERY_FAILURE_MESSAGE, true);
  }

  // Do not log the token or the submitter's contact details. The durable DB
  // row/admin message is the audit record.
  console.info(
    `[submission] ${kind} accepted (database=${stored}, admin_email=${emailed}).`,
  );
  return { ok: true, token };
}

/** Thin wrapper over the shared owner-notification channel, kept so the call
 *  sites below read the same as they always did. Behaviour is unchanged: same
 *  from-address, same recipient default, same 5s timeout, same fail-soft. */
async function maybeSendAdminEmail(
  kind: SubmissionKind,
  payload: object,
): Promise<boolean> {
  return sendAdminEmail({
    subject: `New ${kind.replace("_", " ")} submission`,
    text: JSON.stringify(payload, null, 2),
    tag: "submission",
  });
}

export async function submitPlaceAction(
  input: unknown,
): Promise<SubmissionActionResult> {
  const origin = await verifyPublicSubmissionOrigin();
  if (!origin.ok) return origin.failure;

  const validated = validatePlaceSubmission(input);
  if (validated.status === "bot") return botAcceptedToken();
  const limited = await publicSubmissionRateLimit(origin.request);
  if (limited) return limited;
  if (validated.status === "invalid") {
    return submissionFailure(validated.message, false);
  }

  return persistSubmission("place", validated.data, {
    submitter_name: validated.data.submitter_name,
    submitter_email: validated.data.submitter_email,
    place_slug: null,
  });
}

export async function submitEventAction(
  input: unknown,
): Promise<SubmissionActionResult> {
  const origin = await verifyPublicSubmissionOrigin();
  if (!origin.ok) return origin.failure;

  const validated = validateEventSubmission(input);
  if (validated.status === "bot") return botAcceptedToken();
  const limited = await publicSubmissionRateLimit(origin.request);
  if (limited) return limited;
  if (validated.status === "invalid") {
    return submissionFailure(validated.message, false);
  }

  return persistSubmission("event", validated.data, {
    submitter_name: validated.data.submitter_name,
    submitter_email: validated.data.submitter_email,
    place_slug: null,
  });
}

export async function submitBusinessClaimAction(
  input: unknown,
): Promise<SubmissionActionResult> {
  const origin = await verifyPublicSubmissionOrigin();
  if (!origin.ok) return origin.failure;

  const validated = validateClaimSubmission(input);
  if (validated.status === "bot") return botAcceptedToken();
  const limited = await publicSubmissionRateLimit(origin.request);
  if (limited) return limited;
  if (validated.status === "invalid") {
    return submissionFailure(validated.message, false);
  }

  return persistSubmission("business_claim", validated.data, {
    submitter_name: validated.data.owner_name,
    submitter_email: validated.data.owner_email,
    place_slug: validated.data.place_slug || null,
  });
}
