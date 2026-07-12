"use server";

import { revalidatePath } from "next/cache";
import { recordDecision, type Decision } from "@/lib/discovered-review";

/**
 * Persist one editor decision (to the curation_decisions table) and re-render
 * the review page so the counts + next-undecided cursor reflect it. Runs from
 * prod/phone now that persistence is DB-backed, not a local file. Access is
 * gated by the /admin Basic Auth in middleware.
 */
export async function decide(
  placeId: string,
  decision: Decision | "clear",
): Promise<void> {
  await recordDecision(placeId, decision);
  revalidatePath("/admin/discovered-review");
}
