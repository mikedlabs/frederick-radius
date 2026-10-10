/**
 * Canonicalize event timestamps at the archive hydrate boundary.
 *
 * Some live rows store Postgres text (`2026-10-11 18:00:00+00`) instead of
 * ISO. Rewriting to UTC ISO is cleanup so every client sees one form; it
 * does not shift the instant. Date-only values and null stay as published.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIMED =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}(?::?\d{2})?)$/i;

function expandOffset(offset: string): string {
  if (offset.toUpperCase() === "Z") return "Z";
  if (/^[+-]\d{2}$/.test(offset)) return `${offset}:00`;
  if (/^[+-]\d{4}$/.test(offset)) {
    return `${offset.slice(0, 3)}:${offset.slice(3)}`;
  }
  return offset;
}

/**
 * Accept ISO, `YYYY-MM-DD HH:MM:SS[.fff]+HH[:MM]`, and `Z`. Return a
 * canonical UTC ISO string. Leave date-only values and null alone.
 */
export function normalizeEventTimestamp(
  value: unknown,
): string | null | undefined {
  if (value == null) return value;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  }
  if (typeof value !== "string") return undefined;

  const raw = value.trim();
  if (!raw) return value;
  if (DATE_ONLY.test(raw)) return raw;

  const match = TIMED.exec(raw);
  const parseable = match
    ? `${match[1]}T${match[2]}${expandOffset(match[3])}`
    : raw;
  const ms = Date.parse(parseable);
  if (!Number.isFinite(ms)) return raw;
  return new Date(ms).toISOString();
}
