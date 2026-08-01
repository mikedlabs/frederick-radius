"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { dear_frederick_submissions } from "@/lib/db/schema";
import { hasLetterPublicationConsent } from "@/lib/dear-frederick/consent";

/**
 * Approve or reject one Dear Frederick submission. Form action: reads `id` and
 * `decision` from the posted FormData. Gated by the /admin Basic Auth in
 * middleware (this POSTs to an /admin/* path, so the credentials are resent).
 *
 * This ONLY records the moderation decision and stamps the decided time.
 * Approving does NOT publish anything: the owner still transcribes an approved
 * letter into src/data/dear-frederick.ts by hand, so the public wall stays
 * curated and the published letters are never database-dynamic.
 */
export async function reviewLetterSubmission(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "approved" && decision !== "rejected")) return;

  const db = getDb();
  if (!db) throw new Error("Database not configured.");

  if (decision === "approved") {
    const [submission] = await db
      .select({ imageUrl: dear_frederick_submissions.image_url })
      .from(dear_frederick_submissions)
      .where(eq(dear_frederick_submissions.id, id))
      .limit(1);
    if (!submission || !hasLetterPublicationConsent(submission.imageUrl)) {
      throw new Error(
        "Publication consent is not recorded for this letter. Contact the sender before approval.",
      );
    }
  }

  await db
    .update(dear_frederick_submissions)
    .set({ status: decision, decided_at: new Date() })
    .where(eq(dear_frederick_submissions.id, id));
  revalidatePath("/admin/dear-frederick");
}
