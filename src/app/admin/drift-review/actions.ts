"use server";

import { revalidatePath } from "next/cache";
import {
  recordDecision,
  type DriftDecision,
  type DriftField,
} from "@/lib/drift-review";

export async function decideDrift(
  slug: string,
  field: DriftField,
  decision: DriftDecision | "clear",
): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Drift review is dev-mode only.");
  }
  recordDecision(slug, field, decision);
  revalidatePath("/admin/drift-review");
}
