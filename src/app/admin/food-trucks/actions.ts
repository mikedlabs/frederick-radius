"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { food_truck_claims } from "@/lib/db/schema";
import { newBeaconToken } from "@/lib/food-trucks/token";

/**
 * Approve or reject one food-truck claim. Form action: reads `id` and
 * `decision` from the posted FormData. Gated by the /admin Basic Auth in
 * middleware (this POSTs to an /admin/* path, so the credentials are resent).
 *
 * Approving mints the operator's beacon token ONCE (on first approval) and
 * stamps the decision time. That token is the capability the owner hands to the
 * operator; it is the only credential that authorizes a beacon write. Rejecting
 * just records the decision. Re-approving a claim that already has a token keeps
 * the existing token so a link the owner already shared never breaks.
 */
export async function reviewFoodTruckClaim(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "approved" && decision !== "rejected")) return;

  const db = getDb();
  if (!db) throw new Error("Database not configured.");

  const existing = (
    await db
      .select({ token: food_truck_claims.token })
      .from(food_truck_claims)
      .where(eq(food_truck_claims.id, id))
      .limit(1)
  )[0];
  if (!existing) return;

  const patch: { status: string; decided_at: Date; token?: string } = {
    status: decision,
    decided_at: new Date(),
  };
  if (decision === "approved" && !existing.token) {
    patch.token = newBeaconToken();
  }

  await db.update(food_truck_claims).set(patch).where(eq(food_truck_claims.id, id));
  revalidatePath("/admin/food-trucks");
}
