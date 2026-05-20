"use server";

import { revalidatePath } from "next/cache";
import { recordDecision, type Decision } from "@/lib/discovered-review";

/**
 * Persist one editor decision and trigger a re-render of the review
 * page so the counts + next-undecided cursor reflect it.
 *
 * Dev-mode only: writes to the local filesystem. The route below the
 * page guards on env so the form posts cannot fire in production.
 */
export async function decide(
  placeId: string,
  decision: Decision | "clear",
): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Discovered review is dev-mode only.");
  }
  recordDecision(placeId, decision);
  revalidatePath("/admin/discovered-review");
}
