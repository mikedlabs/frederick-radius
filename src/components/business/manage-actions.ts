"use server";

import { getDb } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";
import { approvedOwnerClaimForToken } from "@/lib/business/manage-access";
import { ownerListingPlaceForSlug } from "@/lib/business/owner-listing-server";
import {
  confirmableListingFields,
  ownerListingAuditPayload,
  ownerListingFacts,
} from "@/lib/business/owner-listing-confirmation";
import {
  validateOwnerListingConfirmation,
  validateOwnerPost,
  type OwnerListingConfirmationInput,
  type OwnerPostInput,
} from "@/lib/submissions";

/**
 * Post an owner update (a special or an event) from the management
 * surface. The `token` is re-verified server-side: only an approved
 * business_claim with a matching manage_token may post, so the client
 * cannot claim a business it does not own. The update lands as a
 * moderated `submissions` row, surfacing in the /admin/claims queue.
 */
export async function postOwnerUpdateAction(
  token: string,
  input: OwnerPostInput,
): Promise<void> {
  const error = validateOwnerPost(input);
  if (error) throw new Error(error);

  const db = getDb();
  if (!db) throw new Error("Service is temporarily unavailable.");

  const claim = await approvedOwnerClaimForToken(token);
  if (!claim) throw new Error("This management link is not valid.");

  const payload = (claim.payload ?? {}) as Record<string, unknown>;
  const businessName =
    typeof payload.business_name === "string" ? payload.business_name : "";

  await db.insert(submissions).values({
    kind: input.kind,
    place_slug: claim.place_slug,
    submitter_name: businessName || null,
    payload: { ...input, business_name: businessName, via: "owner-manage" },
  });
}

/**
 * Record a listing confirmation or correction request from an approved owner.
 * The public place is never changed here. The server rebuilds the listing
 * snapshot, timestamps the observation, and sends one bounded submission to
 * the existing moderation queue.
 */
export async function submitOwnerListingConfirmationAction(
  token: string,
  input: OwnerListingConfirmationInput,
): Promise<void> {
  const error = validateOwnerListingConfirmation(input);
  if (error) throw new Error(error);

  const db = getDb();
  if (!db) throw new Error("Service is temporarily unavailable.");

  const claim = await approvedOwnerClaimForToken(token);
  if (!claim) throw new Error("This management link is not valid.");
  if (!claim.place_slug) {
    throw new Error("This management link is not tied to a Radius listing yet.");
  }

  const place = ownerListingPlaceForSlug(claim.place_slug);
  if (!place) {
    throw new Error("We couldn’t find the listing tied to this link.");
  }
  if (
    input.decision === "confirmed" &&
    confirmableListingFields(ownerListingFacts(place)).length === 0
  ) {
    throw new Error(
      "There are no published details to confirm yet. Report a change instead.",
    );
  }

  const claimPayload = (claim.payload ?? {}) as Record<string, unknown>;
  const claimedName =
    typeof claimPayload.business_name === "string"
      ? claimPayload.business_name.trim()
      : "";
  const businessName = claimedName || place.name;
  const payload = ownerListingAuditPayload({
    businessName,
    claimSubmissionId: claim.id,
    input,
    place,
  });

  await db.insert(submissions).values({
    kind:
      input.decision === "confirmed"
        ? "listing_confirmation"
        : "listing_change",
    place_slug: claim.place_slug,
    submitter_name: businessName,
    submitter_email: claim.submitter_email,
    payload,
  });
}
