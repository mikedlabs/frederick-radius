import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";

export type ApprovedOwnerClaim = {
  id: string;
  place_slug: string | null;
  payload: unknown;
  submitter_email: string | null;
};

/**
 * Resolve the capability token shared by the owner page and every owner
 * action. Keeping the kind/status boundary here prevents either path from
 * accidentally accepting a token attached to another submission type.
 */
export async function approvedOwnerClaimForToken(
  token: string,
): Promise<ApprovedOwnerClaim | undefined> {
  if (!token || token.length > 200) return undefined;
  const db = getDb();
  if (!db) return undefined;

  return (
    await db
      .select({
        id: submissions.id,
        place_slug: submissions.place_slug,
        payload: submissions.payload,
        submitter_email: submissions.submitter_email,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.manage_token, token),
          eq(submissions.status, "approved"),
          eq(submissions.kind, "business_claim"),
        ),
      )
      .limit(1)
  )[0];
}
