import type { DayOfWeek, Hours, OperationalStatus, Place } from "@/data/places";
import { DAY_LABEL, formatWindows } from "@/lib/hours";
import type {
  OwnerListingChangeField,
  OwnerListingConfirmationInput,
} from "@/lib/submissions";

const DAY_ORDER: DayOfWeek[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

const STATUS_LABEL: Record<OperationalStatus, string> = {
  operational: "Operating",
  closed_temporarily: "Temporarily closed",
  closed_permanently: "Permanently closed",
  needs_verification: "Not yet confirmed",
};

const FIELD_LIFETIME_DAYS: Record<OwnerListingChangeField, number> = {
  hours: 7,
  status: 30,
  other: 30,
  phone: 180,
  website: 180,
};

const DAY_MS = 86_400_000;

type ListingFactSource = Pick<
  Place,
  | "hours"
  | "hours_updated_at"
  | "is_operational"
  | "last_verified_at"
  | "phone"
  | "website"
>;

export type OwnerListingFacts = {
  status?: {
    value: OperationalStatus;
    label: string;
    /** A needs-verification marker is context, not a fact an owner confirms. */
    confirmable: boolean;
  };
  hours: {
    lines: string[];
    checkedAt?: string;
  } | null;
  phone?: string;
  website?: string;
  listingCheckedAt?: string;
};

/** Build the exact, serializable facts shown on the owner page. */
export function ownerListingFacts(place: ListingFactSource): OwnerListingFacts {
  const status = place.is_operational
    ? {
        value: place.is_operational,
        label: STATUS_LABEL[place.is_operational],
        confirmable: place.is_operational !== "needs_verification",
      }
    : undefined;
  const hoursLines = formatListedHours(place.hours);

  return {
    status,
    hours:
      hoursLines.length > 0
        ? { lines: hoursLines, checkedAt: place.hours_updated_at }
        : null,
    phone: cleanOptional(place.phone),
    website: cleanOptional(place.website),
    listingCheckedAt: cleanOptional(place.last_verified_at),
  };
}

/** Fields that a positive owner check can actually corroborate. */
export function confirmableListingFields(
  facts: OwnerListingFacts,
): OwnerListingChangeField[] {
  const fields: OwnerListingChangeField[] = [];
  if (facts.status?.confirmable) fields.push("status");
  if (facts.hours) fields.push("hours");
  if (facts.phone) fields.push("phone");
  if (facts.website) fields.push("website");
  return fields;
}

export type OwnerListingAuditPayloadArgs = {
  businessName: string;
  claimSubmissionId: string;
  input: OwnerListingConfirmationInput;
  place: ListingFactSource;
  now?: Date;
};

/**
 * Create the moderated, auditable payload stored in the existing submissions
 * queue. The review deadline and field-specific expiry intent are data, not a
 * claim that a change has already been published.
 */
export function ownerListingAuditPayload({
  businessName,
  claimSubmissionId,
  input,
  place,
  now = new Date(),
}: OwnerListingAuditPayloadArgs): Record<string, unknown> {
  const facts = ownerListingFacts(place);
  const fields =
    input.decision === "confirmed"
      ? confirmableListingFields(facts)
      : [...input.changed_fields];
  const observedAt = now.toISOString();
  const fieldExpiry = Object.fromEntries(
    fields.map((field) => [
      field,
      new Date(now.getTime() + FIELD_LIFETIME_DAYS[field] * DAY_MS).toISOString(),
    ]),
  );
  const earliestExpiryDays =
    fields.length > 0
      ? Math.min(...fields.map((field) => FIELD_LIFETIME_DAYS[field]))
      : 30;
  const isChange = input.decision === "change";
  const fieldSet = new Set(input.changed_fields);

  return {
    schema_version: 1,
    business_name: businessName,
    action: input.decision,
    fields,
    via: "owner-manage",
    source_role: "approved_owner",
    moderation: "required",
    claim_submission_id: claimSubmissionId,
    observed_at: observedAt,
    review_by: new Date(
      now.getTime() + (isChange ? 24 : 72) * 60 * 60 * 1_000,
    ).toISOString(),
    expires_at: new Date(
      now.getTime() + earliestExpiryDays * DAY_MS,
    ).toISOString(),
    field_expires_at: JSON.stringify(fieldExpiry),
    current_status: facts.status?.value ?? "",
    current_hours: facts.hours?.lines.join("; ") ?? "",
    current_hours_json: place.hours ? JSON.stringify(place.hours) : "",
    current_hours_checked_at: facts.hours?.checkedAt ?? "",
    current_phone: facts.phone ?? "",
    current_website: facts.website ?? "",
    current_listing_checked_at: facts.listingCheckedAt ?? "",
    proposed_status:
      isChange && fieldSet.has("status") ? input.proposed_status : "",
    proposed_hours:
      isChange && fieldSet.has("hours") ? input.proposed_hours.trim() : "",
    proposed_phone:
      isChange && fieldSet.has("phone")
        ? input.proposed_phone.trim() || "[remove]"
        : "",
    proposed_website:
      isChange && fieldSet.has("website")
        ? input.proposed_website.trim() || "[remove]"
        : "",
    details: isChange ? input.details.trim() : "",
  };
}

function formatListedHours(hours: Hours | undefined): string[] {
  if (!hours) return [];
  return DAY_ORDER.flatMap((day) => {
    // A missing day is unknown, not closed. Only show days the listing carries.
    if (!Object.prototype.hasOwnProperty.call(hours, day)) return [];
    return [`${DAY_LABEL[day]} ${formatWindows(hours[day] ?? [])}`];
  });
}

function cleanOptional(value: string | null | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}
