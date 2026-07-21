"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { dear_frederick_submissions } from "@/lib/db/schema";

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
export async function reviewLetterSubmission(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "approved" && decision !== "rejected")) return;

  const db = getDb();
  if (!db) throw new Error("Database not configured.");

  await db
    .update(dear_frederick_submissions)
    .set({ status: decision, decided_at: new Date() })
    .where(eq(dear_frederick_submissions.id, id));
  revalidatePath("/admin/dear-frederick");
}
