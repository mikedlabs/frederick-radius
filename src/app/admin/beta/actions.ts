"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";

/**
 * Resolve one feedback note from the beta dashboard. Feedback shares the
 * `submissions` status flow (pending/approved/rejected) so the claims queue
 * and this inbox stay in sync, but the semantics here are "done"/"dismissed",
 * not moderation. Scoped to kind="feedback" so this action can never flip a
 * business claim or place submission, even with a forged id.
 */
export async function resolveFeedback(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "approved" && decision !== "rejected")) return;

  const db = getDb();
  if (!db) throw new Error("Database not configured.");

  await db
    .update(submissions)
    .set({ status: decision, reviewed_at: new Date() })
    .where(and(eq(submissions.id, id), eq(submissions.kind, "feedback")));

  revalidatePath("/admin/beta");
  revalidatePath("/admin/claims");
}
