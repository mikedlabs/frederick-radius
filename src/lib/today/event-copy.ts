import { eventReasons } from "@/lib/event-reasons";
import { eventSourceLabel } from "@/lib/events/source-label";
import { eventTown } from "@/lib/events/eventTown";
import { CATEGORY_BY_SLUG, type Category } from "@/data/categories";
import type { EventWithMeta } from "@/lib/loaders/events";

const COMMUNITY = CATEGORY_BY_SLUG.community;
const LIBRARY = CATEGORY_BY_SLUG.library;
const FAMILY = CATEGORY_BY_SLUG.family;

/** Numbered street + suffix. "110 E Patrick St" matches; "Patrick Street Pub" does not. */
const STREET_ADDRESS_VENUE =
  /^\d{1,6}\s+\S.*\b(?:avenue|ave|boulevard|blvd|circle|cir|court|ct|drive|dr|highway|hwy|lane|ln|parkway|pkwy|pike|place|pl|road|rd|street|st|terrace|ter|trail|trl|way)\.?\b/i;

export function todayVenueIsStreetAddress(
  venue: string | null | undefined,
): boolean {
  const value = venue?.replace(/\s+/g, " ").trim();
  if (!value) return false;
  const head = value.split(",")[0]?.trim() ?? "";
  return STREET_ADDRESS_VENUE.test(head);
}

/**
 * Presentation category for a Today card.
 *
 * A known slug keeps its own cue, including Family and Libraries, so those
 * listings sit at the same visual weight as ticketed shows. Missing or
 * unknown categories become Community. FCPL rows without a slug still use
 * Libraries. This does not change pick selection.
 */
export function todayEventCategory(
  event: Pick<EventWithMeta, "category" | "source" | "audience" | "venue_name" | "title">,
): Category {
  const slug = event.category?.trim();
  if (slug && CATEGORY_BY_SLUG[slug]) return CATEGORY_BY_SLUG[slug];

  if (event.source === "fcpl") return LIBRARY;

  const hay = `${event.venue_name ?? ""} ${event.title ?? ""}`;
  if (/\blibrary\b/i.test(hay)) return LIBRARY;

  if ((event.audience ?? []).some((tag) => /kids|family|children/i.test(tag))) {
    return FAMILY;
  }

  return COMMUNITY;
}

export function todayEventWhere(
  event: Pick<EventWithMeta, "venue_name" | "municipality" | "municipality_name">,
): { kind: "place" | "address"; text: string } | null {
  const venue = event.venue_name?.replace(/\s+/g, " ").trim() ?? "";
  const town = eventTown(event);
  if (todayVenueIsStreetAddress(venue)) {
    const street = venue.split(",")[0]?.trim() ?? venue;
    const townAlreadyIn = Boolean(
      town && venue.toLowerCase().includes(town.toLowerCase()),
    );
    const text = town && !townAlreadyIn ? `${street} · ${town}` : street;
    return { kind: "address", text };
  }
  if (venue && town && town.toLowerCase() !== venue.toLowerCase()) {
    return { kind: "place", text: `${venue} · ${town}` };
  }
  if (venue) return { kind: "place", text: venue };
  if (town) return { kind: "address", text: town };
  return null;
}

/** One honest why line. Never invent a reason the data does not support. */
export function todayEventWhy(
  event: EventWithMeta,
  now?: Date,
): string | null {
  const reason = eventReasons(event, now)[0]?.label?.trim();
  if (reason) return reason;

  const description = event.description?.replace(/\s+/g, " ").trim();
  if (description) {
    const sentence = description.split(/(?<=[.!?])\s+/)[0] ?? description;
    const clipped = sentence.slice(0, 88).trim();
    if (clipped.length >= 12) {
      return clipped.length < sentence.length ? `${clipped.replace(/\s+\S*$/, "")}…` : clipped;
    }
  }

  return todayEventCategory(event).name;
}

/** Who published the listing. Never an official-stamp or "Verified" label. */
export function todayEventSourceLabel(event: EventWithMeta): string | null {
  if (event.source) {
    try {
      return eventSourceLabel(event.source, event.organizer);
    } catch {
      return event.source;
    }
  }
  const organizer = event.organizer?.replace(/\s+/g, " ").trim();
  return organizer || null;
}

/** AA-safe category text on cream: mix the vivid hue toward ink. */
export function todayCategoryTextColor(accent: string): string {
  return `color-mix(in srgb, ${accent} 55%, var(--app-ink))`;
}
