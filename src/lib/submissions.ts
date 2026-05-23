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
