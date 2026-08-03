/**
 * Shared JSON-LD builders (June-9 deep audit P2: structured-data gaps).
 *
 * Detail pages carried Event/Place schema, but listings, categories, and
 * towns had none, and event times were emitted as UTC "Z" instants —
 * accepted by Google but local-offset form is preferred and
 * self-documents timezone correctness. Pure helpers; pages stringify
 * into a <script type="application/ld+json"> themselves.
 */

import type { DayOfWeek, Hours } from "@/data/places";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://frederickradius.app";
const ET = "America/New_York";

const SCHEMA_DAY: Record<DayOfWeek, string> = {
  sun: "https://schema.org/Sunday",
  mon: "https://schema.org/Monday",
  tue: "https://schema.org/Tuesday",
  wed: "https://schema.org/Wednesday",
  thu: "https://schema.org/Thursday",
  fri: "https://schema.org/Friday",
  sat: "https://schema.org/Saturday",
};

export function absoluteSiteUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, BASE).toString();
  } catch {
    return undefined;
  }
}

/**
 * Convert Radius's already freshness-gated structured hours into Schema.org.
 * Callers must pass the decorated place hours, never the raw provider schedule:
 * the decorated loader removes stale or unreviewed schedules first.
 */
export function openingHoursJsonLd(hours: Hours | undefined) {
  if (!hours) return undefined;
  const rows = (Object.keys(SCHEMA_DAY) as DayOfWeek[]).flatMap((day) =>
    (hours[day] ?? []).map((window) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: SCHEMA_DAY[day],
      opens: window.open,
      closes: window.close,
    })),
  );
  return rows.length > 0 ? rows : undefined;
}

/**
 * "2026-06-11T21:00:00.000Z" → "2026-06-11T17:00:00-04:00": the same
 * instant expressed in Eastern wall time with its UTC offset (DST-aware
 * via Intl longOffset). Returns undefined for missing/garbage input so
 * callers can spread it straight into a schema object.
 */
export function easternOffsetIso(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(+d)) return undefined;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ET,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "longOffset",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  let off = String(parts.timeZoneName ?? "").replace("GMT", "");
  // Normalize "−4" / "-4" / "-04" → "-04:00"; empty (UTC) → "+00:00".
  const m = off.match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
  off = m ? `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}` : "+00:00";
  const hour = String(Number(parts.hour) % 24).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}${off}`;
}

type Crumb = { name: string; path: string };

export function breadcrumbJsonLd(items: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${BASE}${it.path}`,
    })),
  };
}

/** ItemList of site URLs — for /events and category collection pages. */
export function itemListJsonLd(name: string, items: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: `${BASE}${it.path}`,
    })),
  };
}

/**
 * Serialize a JSON-LD object for SAFE embedding inside a
 * `<script type="application/ld+json">` tag.
 *
 * Bare `JSON.stringify` does not escape `<`, `>`, `&`, or the U+2028/U+2029
 * line separators. A third-party-feed field containing `</script>` (or even a
 * lone `</script` with no `>`, which our balanced-tag stripper leaves intact)
 * therefore terminates the script element verbatim, and the HTML parser reads
 * everything after as live markup — a stored-XSS vector for any place/event
 * title, venue, organizer, or address we don't control. Escaping these few
 * characters to their `\uXXXX` form keeps the payload byte-identical to a JSON
 * parser while making a tag break-out impossible. Route EVERY
 * `dangerouslySetInnerHTML` JSON-LD emit through this.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
