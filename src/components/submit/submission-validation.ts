import { z } from "zod";
import { CATEGORIES } from "@/data/categories";
import { MUNICIPALITIES } from "@/data/municipalities";
import type {
  SubmitEventInput,
  SubmitPlaceInput,
} from "@/components/submit/actions";
import type { SubmitBusinessClaimInput } from "@/lib/submissions";

export type PublicSubmissionProof = {
  /** Kept empty by people; basic form-filling bots commonly populate it. */
  contact_fax: string;
};

type SubmissionPayload = Record<string, unknown>;

export type SubmissionValidationResult<T extends SubmissionPayload> =
  | { status: "valid"; data: T }
  | { status: "bot" }
  | { status: "invalid"; message: string };

const EMAIL_RX = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,63}$/;
const SLUG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCAL_DATETIME_RX =
  /^(\d{4})-(0[1-9]|1[0-2])-([012]\d|3[01])T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const categorySlugs = new Set([
  ...CATEGORIES.map((category) => category.slug),
  "food-truck",
]);
const municipalitySlugs = new Set(
  MUNICIPALITIES.map((municipality) => municipality.slug),
);

function text(label: string, max: number) {
  return z
    .string({ error: `${label} must be text.` })
    .trim()
    .max(max, `${label} is too long.`);
}

function requiredText(label: string, max: number) {
  return text(label, max).min(1, `${label} is required.`);
}

function email(label = "Email") {
  return text(label, 254).refine(
    (value) => EMAIL_RX.test(value),
    `Enter a valid ${label.toLowerCase()}.`,
  );
}

function optionalHttpUrl(label: string) {
  return text(label, 2_048).refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, `${label} must be a complete http or https URL.`);
}

const publicProofSchema = z.object({
  contact_fax: z.string().max(200),
});

/**
 * Validate a datetime-local value without letting Date.parse normalize an
 * impossible wall-clock date (for example, February 31 into March). Treating
 * the components as UTC is intentional: these are Frederick local wall-clock
 * values, and ordering them must not depend on the server's timezone.
 */
function localDateTimeValue(value: string): number | null {
  const match = LOCAL_DATETIME_RX.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? "0");
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  const parsed = new Date(timestamp);

  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day &&
    parsed.getUTCHours() === hour &&
    parsed.getUTCMinutes() === minute &&
    parsed.getUTCSeconds() === second
    ? timestamp
    : null;
}

const placeSchema = z
  .object({
    name: requiredText("Name", 120),
    category: requiredText("Category", 64).refine(
      (value) => categorySlugs.has(value),
      "Choose a valid category.",
    ),
    address: text("Address", 240),
    municipality: requiredText("Town", 80).refine(
      (value) => municipalitySlugs.has(value),
      "Choose a valid town.",
    ),
    website: optionalHttpUrl("Website"),
    phone: text("Phone", 40),
    description: text("Description", 1_500),
    social_url: optionalHttpUrl("Social link"),
    photo_url: optionalHttpUrl("Photo link"),
    photo_permission: z.boolean(),
    submitter_email: email(),
    submitter_name: text("Your name", 120),
    is_owner: z.boolean(),
    ...publicProofSchema.shape,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.photo_url && !value.photo_permission) {
      context.addIssue({
        code: "custom",
        path: ["photo_permission"],
        message:
          "Confirm that Frederick Radius has permission to display the submitted photo.",
      });
    }
  });

const eventSchema = z
  .object({
    title: requiredText("Title", 160),
    description: text("Description", 4_000),
    starts_at: requiredText("Start time", 32).refine(
      (value) => localDateTimeValue(value) !== null,
      "Enter a valid start date and time.",
    ),
    ends_at: text("End time", 32).refine(
      (value) => !value || localDateTimeValue(value) !== null,
      "Enter a valid end date and time.",
    ),
    venue_name: text("Venue name", 160),
    address: text("Address", 240),
    municipality: text("Town", 80).refine(
      (value) => !value || municipalitySlugs.has(value),
      "Choose a valid town.",
    ),
    category: text("Category", 64).refine(
      (value) => !value || categorySlugs.has(value),
      "Choose a valid category.",
    ),
    is_free: z.boolean(),
    price_text: text("Price", 80),
    ticket_url: optionalHttpUrl("Ticket link"),
    organizer: text("Organizer", 160),
    submitter_email: email(),
    submitter_name: text("Your name", 120),
    ...publicProofSchema.shape,
  })
  .strict()
  .superRefine((value, context) => {
    const start = localDateTimeValue(value.starts_at);
    const end = value.ends_at ? localDateTimeValue(value.ends_at) : null;
    if (start !== null && end !== null && end <= start) {
      context.addIssue({
        code: "custom",
        path: ["ends_at"],
        message: "End time must be after the start time.",
      });
    }
  });

const businessClaimSchema = z
  .object({
    business_name: requiredText("Business name", 160),
    place_slug: text("Place", 160).refine(
      (value) => !value || SLUG_RX.test(value),
      "Choose a valid place.",
    ),
    owner_name: requiredText("Your name", 120),
    owner_role: text("Your role", 120),
    owner_email: email(),
    owner_phone: text("Business phone", 40),
    note: text("Note", 2_000),
    ...publicProofSchema.shape,
  })
  .strict();

function finishValidation<T extends SubmissionPayload>(
  result: z.ZodSafeParseResult<T & PublicSubmissionProof>,
): SubmissionValidationResult<T> {
  if (!result.success) {
    return {
      status: "invalid",
      message:
        result.error.issues[0]?.message ??
        "Check the submission and try again.",
    };
  }

  const { contact_fax: _contactFax, ...data } = result.data;
  void _contactFax;

  return { status: "valid", data: data as unknown as T };
}

function hasFilledBotTrap(input: unknown): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = (input as Record<string, unknown>).contact_fax;
  return typeof value === "string" && value.trim().length > 0;
}

type PlacePayload = Omit<SubmitPlaceInput, keyof PublicSubmissionProof>;
type EventPayload = Omit<SubmitEventInput, keyof PublicSubmissionProof>;

export function validatePlaceSubmission(
  input: unknown,
): SubmissionValidationResult<PlacePayload> {
  if (hasFilledBotTrap(input)) return { status: "bot" };
  return finishValidation<PlacePayload>(placeSchema.safeParse(input));
}

export function validateEventSubmission(
  input: unknown,
): SubmissionValidationResult<EventPayload> {
  if (hasFilledBotTrap(input)) return { status: "bot" };
  return finishValidation<EventPayload>(eventSchema.safeParse(input));
}

export function validateClaimSubmission(
  input: unknown,
): SubmissionValidationResult<SubmitBusinessClaimInput> {
  if (hasFilledBotTrap(input)) return { status: "bot" };
  return finishValidation<SubmitBusinessClaimInput>(
    businessClaimSchema.safeParse(input),
  );
}
