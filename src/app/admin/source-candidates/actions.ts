"use server";

import { revalidatePath } from "next/cache";
import {
  decideSourceCandidate,
  type SourceCandidateDecision,
} from "@/lib/source-candidates";

export async function reviewSourceCandidate(
  decisionKey: string,
  decision: SourceCandidateDecision | "clear",
): Promise<void> {
  await decideSourceCandidate(decisionKey, decision);
  revalidatePath("/admin/source-candidates");
  revalidatePath("/admin");
}
