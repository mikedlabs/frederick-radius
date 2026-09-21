import { z } from "zod";
import type { FairScheduleSourceItem } from "@/lib/fair/schedule";
import { easternWallToUtcISO } from "@/lib/tz";

/** Manually transcribed after visual review of PDF pages 14, 20 and 21.
 * This additive review never rewrites or promotes the immutable 188-row pack.
 * The PDF's Aug 25 revision is not a claim that these events were updated today.
 */
export const FAIR_PROGRAM_PDF_REVIEW = {
  sourceUrl: "https://thegreatfrederickfair.com/wp-content/uploads/2026/08/2026-GFF-SoE_website.pdf",
  checkedOn: "2026-09-21",
  sourceRevision: "pdf-revision-2026-08-25",
  sourceModifiedAt: "2026-08-25T19:20:24Z",
  validThrough: "2026-09-26",
} as const;

const clockSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const fairProgramSupplementEntrySchema = z.object({
  id: z.string().regex(/^schedule-2026-09-(?:18|19|2[0-6])-pdf-(?:funky-\d{4}|character|bluey)$/),
  date: z.string().regex(/^2026-09-(?:18|19|2[0-6])$/),
  title: z.string().min(2).max(120),
  identity: z.string().min(2).max(100),
  category: z.enum(["music", "character", "bluey"]),
  page: z.union([z.literal(14), z.literal(20)]),
  position: z.number().int().positive(),
  start: clockSchema,
  end: clockSchema.nullable(),
  publishedTimeLabel: z.string().min(1),
  conflict: z.string().min(1).optional(),
}).strict().superRefine((entry, context) => {
  if (!entry.id.startsWith(`schedule-${entry.date}-`)) context.addIssue({ code: "custom", message: "The stable ID must use the source date." });
  if (entry.end && entry.end <= entry.start) context.addIssue({ code: "custom", message: "The source window must end after it starts." });
  if (entry.date === "2026-09-18" && entry.start < "16:00" && !entry.conflict) context.addIssue({ code: "custom", message: "An opening-day pre-gate time needs an explicit conflict note." });
});
type SupplementEntry = z.infer<typeof fairProgramSupplementEntrySchema>;

const clockLabel = (clock: string): string => {
  const [hour, minute] = clock.split(":").map(Number);
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${hour >= 12 ? "pm" : "am"}`;
};
const openingConflict = (time: string) => `The August 25 printed program lists ${time}, before the reviewed 4pm opening on September 18. Confirm this time with the Fair.`;

// The blank 11:30am cell on opening Friday is intentionally not an event.
// Sunday's first cell explicitly overrides the row heading with 10:30am.
const musicDays = [
  [18, null, "Paul Lumsden", "Mikey Mallick"],
  [19, "Lauren O'Neill", "Mikey Mallick", "The Honky Tonk Twins"],
  [20, "Faith at the Fair", "Brushfire", "Jimmy Mowery"],
  [21, "Paul Lumsden", "Shredded Cheddar", "Freddie Long"],
  [22, "Jimmy Mowery", "Jimmy Mowery", "Freddie Long"],
  [23, "Jimmy Mowery", "Mikey Mallick", "Frederick Rock School"],
  [24, "Freddie Long", "John Plese", "John Plese"],
  [25, "Jason Knight", "John Plese", "John Plese"],
  [26, "Jason Knight", "John Plese", "John Plese"],
] as const;
const musicEntries = musicDays.flatMap(([day, morning, afternoon, evening]) => {
  const date = `2026-09-${day}`;
  const slots = [[day === 20 ? "10:30" : "11:30", morning], ["13:00", afternoon], ["15:00", "Dennis Lee Band"], ["17:00", "Dennis Lee Band"], ["19:00", evening]] as const;
  return slots.flatMap(([start, name], index) => name ? [{
    id: `schedule-${date}-pdf-funky-${start.replace(":", "")}`,
    date, title: name, identity: name, category: "music", page: 14,
    position: 1400 + (day - 18) * 5 + index + 1, start, end: null,
    publishedTimeLabel: clockLabel(start),
    ...(day === 18 && start < "16:00" ? { conflict: openingConflict(clockLabel(start)) } : {}),
  }] : []);
});

const characterWindows = [
  [18, "Elsa", "13:00", "16:00"],
  [19, "Spiderman and Black Widow", "16:00", "19:00"],
  [20, "Cinderella", "14:00", "17:00"],
  [21, "Aurora", "12:00", "15:00"],
  [22, "Anna", "13:00", "16:00"],
  [23, "Rapunzel", "13:00", "16:00"],
  [24, "Elsa", "12:00", "15:00"],
  [25, "Belle", "14:00", "17:00"],
  [26, "Ariel", "16:00", "19:00"],
] as const;
const characterEntries = characterWindows.map(([day, name, start, end]) => ({
  id: `schedule-2026-09-${day}-pdf-character`, date: `2026-09-${day}`,
  title: `${name} character visit`, identity: name, category: "character", page: 20,
  position: 2000 + day, start, end, publishedTimeLabel: `${clockLabel(start)} to ${clockLabel(end)}`,
  ...(day === 18 ? { conflict: openingConflict("1pm to 4pm") } : {}),
}));
const blueyEntries = [23, 24, 25].map((day) => ({
  id: `schedule-2026-09-${day}-pdf-bluey`, date: `2026-09-${day}`,
  title: "Bluey meet and greet", identity: "Bluey", category: "bluey", page: 20,
  position: 2100 + day, start: "13:00", end: "15:00", publishedTimeLabel: "1pm to 3pm",
}));

export const greatFrederickFair2026ProgramSupplement: readonly SupplementEntry[] =
  z.array(fairProgramSupplementEntrySchema).parse([...musicEntries, ...characterEntries, ...blueyEntries]);

function timestamp(date: string, clock: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = clock.split(":").map(Number);
  return easternWallToUtcISO(year, month, day, hour, minute);
}
const normalized = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\band\b/g, " ").replace(/\s+/g, " ").trim();

/** Prefer an already-promoted row when both sources name the same performance.
 * For a changed time, match the closest printed slot and keep the newer source.
 * Repeated Dennis Lee / John Plese sets remain distinct scheduled performances.
 */
export function reviewedFairProgramSupplement(base: readonly FairScheduleSourceItem[]): readonly SupplementEntry[] {
  const suppressed = new Set<string>();
  for (const item of base) {
    const text = ` ${normalized(item.text)} `;
    const candidates = greatFrederickFair2026ProgramSupplement.filter((entry) => entry.date === item.fairDate && (entry.id === item.id || text.includes(` ${normalized(entry.identity)} `)));
    if (!candidates.length) continue;
    if (!item.startsAt) {
      candidates.forEach((entry) => suppressed.add(entry.id));
      continue;
    }
    const sourceStart = Date.parse(item.startsAt);
    const closest = [...candidates].sort((a, b) => Math.abs(Date.parse(timestamp(a.date, a.start)) - sourceStart) - Math.abs(Date.parse(timestamp(b.date, b.start)) - sourceStart))[0];
    suppressed.add(closest.id);
  }
  return greatFrederickFair2026ProgramSupplement.filter((entry) => !suppressed.has(entry.id));
}

export function fairProgramSupplementSourceItem(entry: SupplementEntry): FairScheduleSourceItem {
  const place = entry.category === "music"
    ? "Funky Joe's Bandwagon Stage in the Resthaven Area between the Household and Youth Buildings"
    : entry.category === "bluey" ? "Home Arts & Crafts / Household Building (9)" : "Strolling on the Fairgrounds";
  return {
    id: entry.id, dayId: `day-${entry.date}`, fairDate: entry.date, sourcePosition: entry.position,
    text: `${entry.title} - ${place}${entry.conflict ? ` - ${entry.conflict}` : ""}`,
    timeLabel: entry.publishedTimeLabel, inheritedTimeLabel: null, timeOrigin: "explicit",
    timing: entry.conflict ? "unspecified" : entry.end ? "range" : "exact",
    startsAt: entry.conflict ? null : timestamp(entry.date, entry.start),
    endsAt: entry.conflict || !entry.end ? null : timestamp(entry.date, entry.end),
    sourceUid: entry.id, recurrenceId: null, sourceModifiedAt: FAIR_PROGRAM_PDF_REVIEW.sourceModifiedAt,
    sourceUrl: `${FAIR_PROGRAM_PDF_REVIEW.sourceUrl}#page=${entry.page}`,
  };
}

export function fairProgramSupplementPresentation(entry: SupplementEntry) {
  return {
    title: entry.title,
    detail: entry.conflict ?? (entry.category === "music"
      ? "The printed program locates this stage in the Resthaven Area between the Household and Youth Buildings."
      : entry.category === "character" ? "The printed program lists this character visit under strolling entertainment. It does not give a fixed meeting point." : undefined),
    kind: entry.category === "music" ? "concert" as const : "other" as const,
    timeLabel: entry.conflict ? "Confirm time" : entry.publishedTimeLabel,
    placeLabel: entry.category === "music" ? "Published place: Funky Joe's Bandwagon Stage."
      : entry.category === "bluey" ? "Published place: Home Arts & Crafts / Household Building (9)." : "The printed program does not publish a fixed meeting point.",
    sourceReview: { reviewedOn: FAIR_PROGRAM_PDF_REVIEW.checkedOn, validThrough: FAIR_PROGRAM_PDF_REVIEW.validThrough, sourceRevision: FAIR_PROGRAM_PDF_REVIEW.sourceRevision },
  };
}
