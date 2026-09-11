"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { commerce_link_reports } from "@/lib/db/schema";

/**
 * Resolve one broken-link report. Form action: reads `id` and `decision`
 * ("fixed" | "dismissed" | "delete") from the posted FormData.
 *
 *  - fixed     → the link was corrected on the place record; kept as the log.
 *  - dismissed → looked at, nothing wrong (or unreproducible); kept quiet.
 *  - delete    → removed outright (spam / mistakes).
 *
 * The page is Basic-Auth gated by the proxy, so these run admin-only.
 */
export async function reviewLinkReport(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "fixed" && decision !== "dismissed" && decision !== "delete")) return;

  const db = getDb();
  if (!db) throw new Error("Database not configured.");

  if (decision === "delete") {
    await db.delete(commerce_link_reports).where(eq(commerce_link_reports.id, id));
  } else {
    await db
      .update(commerce_link_reports)
      .set({ status: decision, reviewed_at: new Date() })
      .where(eq(commerce_link_reports.id, id));
  }
  revalidatePath("/admin/link-reports");
}
