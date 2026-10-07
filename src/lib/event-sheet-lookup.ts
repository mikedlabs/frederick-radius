import type { EventWithMeta } from "@/lib/loaders/events";
import { fetchSheetLookupJson } from "@/lib/sheet-lookup-json";

export const EVENT_LOOKUP_TIMEOUT_MS = 15_000;

/** Resolve only the requested event through the shared bounded sheet transport. */
export async function fetchEventSheetLookup(
  slug: string,
  parentSignal: AbortSignal,
  timeoutMs = EVENT_LOOKUP_TIMEOUT_MS,
): Promise<EventWithMeta | null> {
  const payload = await fetchSheetLookupJson(
    `/api/events/${encodeURIComponent(slug)}/summary?v=attendance-2`,
    parentSignal,
    timeoutMs,
  ) as { event?: EventWithMeta } | null;
  return payload?.event?.slug === slug ? payload.event : null;
}
