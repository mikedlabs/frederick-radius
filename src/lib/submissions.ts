/**
 * Submission types + pure validators for the user-submission flow
 * (place / event suggestions and business-owner claims). Kept out of
 * the "use server" actions file so the validators stay importable by
 * client components and unit tests.
 */

export type SubmitBusinessClaimInput = {
  business_name: string;
  /** Slug of an existing place when the claim was deep-linked, else "". */
  place_slug: string;
  owner_name: string;
  owner_role: string;
  owner_email: string;
  owner_phone: string;
  note: string;
};

const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Validate a business claim. Returns an error message, or null when the
 * input is good. Pure: no IO, safe to call from the client form and the
 * server action alike.
 */
export function validateBusinessClaim(
  input: SubmitBusinessClaimInput,
): string | null {
  if (!input.business_name.trim()) return "Business name is required.";
  if (!input.owner_name.trim()) return "Your name is required.";
  if (!input.owner_email.trim()) return "Your email is required.";
  if (!EMAIL_RX.test(input.owner_email.trim())) {
    return "Enter a valid email address.";
  }
  return null;
}

/**
 * An owner-posted update from the business management surface: a
 * special (a deal or promo, no hard date) or an event (dated). Both
 * land in the `submissions` table for moderation, like every other
 * submission.
 */
export type OwnerPostInput = {
  kind: "special" | "event";
  title: string;
  details: string;
  /** ISO datetime for an event; "" for a special. */
  starts_at: string;
  /** Optional link: a menu, a ticket page, more info. */
  link: string;
};

/**
 * Validate an owner post. Returns an error message, or null when the
 * input is good. Pure: shared by the client form and the server action.
 */
export function validateOwnerPost(input: OwnerPostInput): string | null {
  if (input.kind !== "special" && input.kind !== "event") {
    return "Choose a special or an event.";
  }
  if (!input.title.trim()) return "A title is required.";
  if (input.kind === "event" && !input.starts_at.trim()) {
    return "An event needs a date and time.";
  }
  return null;
}

/**
 * A listing check from an already-approved owner. This is deliberately a
 * moderation input, not a place mutation: the server records what the owner
 * observed and the admin queue decides whether the public listing changes.
 */
export const OWNER_LISTING_CHANGE_FIELDS = [
  "status",
  "hours",
  "phone",
  "website",
  "other",
] as const;

export type OwnerListingChangeField =
  (typeof OWNER_LISTING_CHANGE_FIELDS)[number];

export type OwnerProposedStatus =
  | "operational"
  | "closed_temporarily"
  | "closed_permanently";

export type OwnerListingConfirmationInput = {
  decision: "confirmed" | "change" | "";
  changed_fields: OwnerListingChangeField[];
  proposed_status: OwnerProposedStatus | "";
  proposed_hours: string;
  proposed_phone: string;
  proposed_website: string;
  details: string;
};

const OWNER_PROPOSED_STATUSES = new Set<OwnerProposedStatus>([
  "operational",
  "closed_temporarily",
  "closed_permanently",
]);

const OWNER_LISTING_FIELD_SET = new Set<string>(
  OWNER_LISTING_CHANGE_FIELDS,
);

/**
 * Validate one owner listing check. The shape is intentionally small and the
 * limits are server-enforced because the management token is a capability
 * credential, not a reason to trust arbitrary client input.
 */
export function validateOwnerListingConfirmation(
  input: OwnerListingConfirmationInput,
): string | null {
  if (input.decision !== "confirmed" && input.decision !== "change") {
    return "Choose whether the listing is current or needs a change.";
  }

  if (input.details.trim().length > 2_000) {
    return "Keep the note under 2,000 characters.";
  }
  if (input.proposed_hours.trim().length > 2_000) {
    return "Keep the hours under 2,000 characters.";
  }
  if (input.proposed_phone.trim().length > 80) {
    return "Keep the phone number under 80 characters.";
  }
  if (input.proposed_website.trim().length > 500) {
    return "Keep the website under 500 characters.";
  }

  const uniqueFields = new Set(input.changed_fields);
  if (
    uniqueFields.size !== input.changed_fields.length ||
    input.changed_fields.some((field) => !OWNER_LISTING_FIELD_SET.has(field))
  ) {
    return "Choose valid listing details to change.";
  }

  if (input.decision === "confirmed") {
    if (input.changed_fields.length > 0) {
      return "A confirmed listing cannot include changed details.";
    }
    return null;
  }

  if (input.changed_fields.length === 0) {
    return "Choose at least one detail that needs changing.";
  }
  if (
    uniqueFields.has("status") &&
    !OWNER_PROPOSED_STATUSES.has(input.proposed_status as OwnerProposedStatus)
  ) {
    return "Choose the business’s current status.";
  }
  if (uniqueFields.has("hours") && !input.proposed_hours.trim()) {
    return "Enter the current hours.";
  }
  if (uniqueFields.has("other") && !input.details.trim()) {
    return "Tell us what else needs changing.";
  }

  const website = input.proposed_website.trim();
  if (uniqueFields.has("website") && website) {
    try {
      const parsed = new URL(website);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "Enter a website beginning with http:// or https://.";
      }
    } catch {
      return "Enter a complete website address.";
    }
  }

  return null;
}
