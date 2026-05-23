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
