"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";

/**
 * Approve or reject one submission. Form action: reads `id` and
 * `decision` from the posted FormData. Approving a business_claim also
 * mints the owner's manage_token (the no-account capability credential
 * the owner management surface will consume), once, on first approval.
 */
export async function reviewSubmission(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "approved" && decision !== "rejected")) return;

  const db = getDb();
  if (!db) throw new Error("Database not configured.");

  const patch: { status: string; reviewed_at: Date; manage_token?: string } = {
    status: decision,
    reviewed_at: new Date(),
  };

  if (decision === "approved") {
    const existing = await db
      .select({
        kind: submissions.kind,
        manage_token: submissions.manage_token,
      })
      .from(submissions)
      .where(eq(submissions.id, id))
      .limit(1);
    const claim = existing[0];
    if (claim && claim.kind === "business_claim" && !claim.manage_token) {
      patch.manage_token = crypto.randomUUID();
    }
  }

  await db.update(submissions).set(patch).where(eq(submissions.id, id));
  revalidatePath("/admin/claims");
}
