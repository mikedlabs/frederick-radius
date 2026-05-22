"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";
import { validateOwnerPost, type OwnerPostInput } from "@/lib/submissions";

/**
 * Post an owner update (a special or an event) from the management
 * surface. The `token` is re-verified server-side: only an approved
 * business_claim with a matching manage_token may post, so the client
 * cannot claim a business it does not own. The update lands as a
 * moderated `submissions` row, surfacing in the /admin/claims queue.
 */
export async function postOwnerUpdateAction(
  token: string,
  input: OwnerPostInput,
): Promise<void> {
  const error = validateOwnerPost(input);
  if (error) throw new Error(error);

  const db = getDb();
  if (!db) throw new Error("Service is temporarily unavailable.");

  const claim = (
    await db
      .select({
        place_slug: submissions.place_slug,
        payload: submissions.payload,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.manage_token, token),
          eq(submissions.status, "approved"),
        ),
      )
      .limit(1)
  )[0];
  if (!claim) throw new Error("This management link is not valid.");

  const payload = (claim.payload ?? {}) as Record<string, unknown>;
  const businessName =
    typeof payload.business_name === "string" ? payload.business_name : "";

  await db.insert(submissions).values({
    kind: input.kind,
    place_slug: claim.place_slug,
    submitter_name: businessName || null,
    payload: { ...input, business_name: businessName, via: "owner-manage" },
  });
}
