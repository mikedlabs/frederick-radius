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
  await recordDecision(slug, field, decision);
  revalidatePath("/admin/drift-review");
}
