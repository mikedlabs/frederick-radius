"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";
import { fanoutToTopic } from "@/lib/push-fanout";
import { businessTopic } from "@/lib/push-topics";

/**
 * Approve or reject one submission. Form action: reads `id` and
 * `decision` from the posted FormData.
 *
 *  - Approving a business_claim mints the owner's manage_token (the
 *    no-account capability credential), once, on first approval.
 *  - Approving a special fans it out as a push: to the people who
 *    follow that business, and to the county-wide "Specials near you"
 *    topic. The fan-out is wrapped so a push failure never fails the
 *    approval itself.
 */
export async function reviewSubmission(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "approved" && decision !== "rejected")) return;

  const db = getDb();
  if (!db) throw new Error("Database not configured.");

  const existing = (
    await db
      .select({
        kind: submissions.kind,
        manage_token: submissions.manage_token,
        place_slug: submissions.place_slug,
        payload: submissions.payload,
      })
      .from(submissions)
      .where(eq(submissions.id, id))
      .limit(1)
  )[0];
  if (!existing) return;

  const patch: { status: string; reviewed_at: Date; manage_token?: string } = {
    status: decision,
    reviewed_at: new Date(),
  };
  if (
    decision === "approved" &&
    existing.kind === "business_claim" &&
    !existing.manage_token
  ) {
    patch.manage_token = crypto.randomUUID();
  }

  await db.update(submissions).set(patch).where(eq(submissions.id, id));
  revalidatePath("/admin/claims");

  if (decision === "approved" && existing.kind === "special") {
    try {
      await fanoutSpecial(id, existing.place_slug, existing.payload);
    } catch (err) {
      console.error(
        "[claims] special approved but push fan-out failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/**
 * Push an approved special to its business's followers and to the
 * shared "Specials near you" topic. One dedupe key per special; the
 * (topic, key) composite keeps the two sends distinct.
 */
async function fanoutSpecial(
  id: string,
  placeSlug: string | null,
  rawPayload: unknown,
): Promise<void> {
  const payload = (rawPayload ?? {}) as Record<string, unknown>;
  const businessName =
    typeof payload.business_name === "string" && payload.business_name.trim()
      ? payload.business_name
      : "A Frederick business";
  const headline =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title
      : "New special";
  const push = {
    title: businessName,
    body: headline,
    url: placeSlug ? `/places/${placeSlug}` : "/",
  };
  const dedupeKey = `special:${id}`;
  if (placeSlug) {
    await fanoutToTopic(businessTopic(placeSlug), dedupeKey, push);
  }
  await fanoutToTopic("specials", dedupeKey, push);
}
