"use server";

import { getDb } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";
import {
  validateBusinessClaim,
  type SubmitBusinessClaimInput,
} from "@/lib/submissions";

export type SubmitPlaceInput = {
  name: string;
  category: string;
  address: string;
  municipality: string;
  website: string;
  phone: string;
  description: string;
  submitter_email: string;
  submitter_name: string;
  is_owner: boolean;
};

export type SubmitEventInput = {
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
  submitter_email: string;
  submitter_name: string;
};

type SubmissionKind = "place" | "event" | "business_claim";

type SubmissionMeta = {
  submitter_name: string;
  submitter_email: string;
  place_slug: string | null;
};

/**
 * Persist a submission. Writes a row to the `submissions` table when a
 * database is configured, then logs a trace and emails the admin. The
 * DB write is wrapped: a missing table (migration not yet applied) or an
 * unreachable database never breaks the submit flow, it degrades to the
 * log + email path. Returns a client-facing token.
 *
 * The token is the capability credential — we never log it. The trace
 * line records type + submitter only so an admin can correlate without
 * the credential leaking into log storage.
 */
async function persistSubmission(
  kind: SubmissionKind,
  payload: Record<string, unknown>,
  meta: SubmissionMeta,
): Promise<string> {
  const token = crypto.randomUUID();

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
    }
  } catch (err) {
    console.error(
      "[submission] DB write failed, kept log + email fallback:",
      err instanceof Error ? err.message : err,
    );
  }

  // Trace without the token — the token is the capability credential
  // and must not land in log storage. Submitter email is enough for an
  // admin to correlate with the DB row or the inbox notification.
  console.info(`[submission] ${kind} from ${meta.submitter_email || "unknown"}`);
  await maybeSendAdminEmail(kind, payload);
  return token;
}

async function maybeSendAdminEmail(
  kind: SubmissionKind,
  payload: object,
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_EMAIL ?? "hello@frederickradius.app";
  if (!key) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Frederick Radius <submissions@frederickradius.app>",
        to,
        subject: `New ${kind.replace("_", " ")} submission`,
        text: JSON.stringify(payload, null, 2),
      }),
    });
  } catch {
    /* swallow: the email is best-effort, the DB row is the record */
  }
}

export async function submitPlaceAction(
  input: SubmitPlaceInput,
): Promise<{ token: string }> {
  if (!input.name || !input.category || !input.submitter_email) {
    throw new Error("Name, category, and email are required.");
  }
  const token = await persistSubmission("place", input, {
    submitter_name: input.submitter_name,
    submitter_email: input.submitter_email,
    place_slug: null,
  });
  return { token };
}

export async function submitEventAction(
  input: SubmitEventInput,
): Promise<{ token: string }> {
  if (!input.title || !input.starts_at || !input.submitter_email) {
    throw new Error("Title, start time, and email are required.");
  }
  const token = await persistSubmission("event", input, {
    submitter_name: input.submitter_name,
    submitter_email: input.submitter_email,
    place_slug: null,
  });
  return { token };
}

export async function submitBusinessClaimAction(
  input: SubmitBusinessClaimInput,
): Promise<{ token: string }> {
  const error = validateBusinessClaim(input);
  if (error) throw new Error(error);
  const token = await persistSubmission("business_claim", input, {
    submitter_name: input.owner_name,
    submitter_email: input.owner_email,
    place_slug: input.place_slug.trim() || null,
  });
  return { token };
}
