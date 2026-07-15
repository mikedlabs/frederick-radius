"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { community_reports } from "@/lib/db/schema";
import { deleteCommunityReportPhoto } from "@/lib/community-report-photo";

/**
 * Moderate one community report. Form action: reads `id` and `decision`
 * ("approved" | "rejected" | "delete") from the posted FormData.
 *
 *  - approved → the report goes live on the map (until its TTL expires).
 *  - rejected → kept for the record but never shown (status='rejected').
 *  - delete   → removed outright (spam / mistakes).
 *
 * The page is Basic-Auth gated by middleware, so these run admin-only.
 */
export async function reviewReport(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "approved" && decision !== "rejected" && decision !== "delete")) return;

  const db = getDb();
  if (!db) throw new Error("Database not configured.");

  if (decision === "delete") {
    const row = (
      await db
        .select({ photo_url: community_reports.photo_url })
        .from(community_reports)
        .where(eq(community_reports.id, id))
        .limit(1)
    )[0];
    if (!(await deleteCommunityReportPhoto(row?.photo_url))) {
      throw new Error("The report photo could not be removed; the report was kept so cleanup can be retried.");
    }
    await db.delete(community_reports).where(eq(community_reports.id, id));
  } else {
    await db
      .update(community_reports)
      .set({ status: decision, reviewed_at: new Date() })
      .where(eq(community_reports.id, id));
  }
  revalidatePath("/admin/reports");
}
