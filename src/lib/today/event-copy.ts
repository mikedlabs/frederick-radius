import { eventReasons } from "@/lib/event-reasons";
import { eventSourceLabel } from "@/lib/events/source-label";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { EventWithMeta } from "@/lib/loaders/events";

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

  const category = CATEGORY_BY_SLUG[event.category ?? ""]?.name;
  return category ?? null;
}

export function todayEventSourceLabel(event: EventWithMeta): string | null {
  if (event.source) {
    try {
      return eventSourceLabel(event.source, event.organizer);
    } catch {
      return event.source;
    }
  }
  return event.is_verified ? "Verified" : null;
}

/** AA-safe category text on cream: mix the vivid hue toward ink. */
export function todayCategoryTextColor(accent: string): string {
  return `color-mix(in srgb, ${accent} 55%, var(--app-ink))`;
}
