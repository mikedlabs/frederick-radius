import { decodeSavedPlanToken, planAreaName, type PlanSpec } from "@/lib/plan/plan-token";

export const SAVED_OUTINGS_KEY = "fr:outings:v1";
export const MAX_SAVED_OUTINGS = 12;
const MAX_STORED_CHARACTERS = MAX_SAVED_OUTINGS * 9_000;

export type SavedOuting = { token: string; title: string; saved_at: string };

export function validOutingTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
    && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
}

/** Never repair unreadable device data by replacing someone’s saved outings. */
export function parseSavedOutings(raw: string | null): SavedOuting[] {
  if (raw === null) return [];
  if (raw.length > MAX_STORED_CHARACTERS) throw new Error("Saved outings could not be read.");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length > MAX_SAVED_OUTINGS) throw new Error("Saved outings could not be read.");
  const tokens = new Set<string>();
  const outings: SavedOuting[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Saved outings could not be read.");
    const row = item as Record<string, unknown>;
    const spec = decodeSavedPlanToken(row.token);
    if (!spec || spec.s.length === 0 || !validOutingTitle(row.title)
      || typeof row.saved_at !== "string" || row.saved_at.length > 40
      || !Number.isFinite(Date.parse(row.saved_at))
      || Object.keys(row).some((key) => !["token", "title", "saved_at"].includes(key))
      || tokens.has(row.token as string)) throw new Error("Saved outings could not be read.");
    const token = row.token as string;
    tokens.add(token);
    // Older visitor plans used "in Frederick" even when the token covered a
    // different town or the whole county. Leave custom and event titles alone.
    const title = spec.i.audience === "visitor" && /^(A morning|An afternoon|An evening) in Frederick$/.test(row.title)
      ? row.title.replace(/in Frederick$/, `in ${planAreaName(spec.i)}`)
      : row.title;
    outings.push({ token, title, saved_at: row.saved_at });
  }
  return outings;
}

/** The exact validated token, never a fresh plan from generic Saved defaults. */
export function savedOutingHref(token: string): string | null {
  return decodeSavedPlanToken(token) ? `/plan?p=${encodeURIComponent(token)}&returnTo=%2Fmy-radius` : null;
}

export function savedOutingDetails(token: string): { spec: PlanSpec; town: string; stopCount: number; dateLabel: string } | null {
  const spec = decodeSavedPlanToken(token);
  if (!spec) return null;
  const town = planAreaName(spec.i);
  const dateLabel = spec.i.start_at
    ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(spec.i.start_at))
    : "No start time saved";
  return { spec, town, stopCount: spec.s.length, dateLabel };
}
