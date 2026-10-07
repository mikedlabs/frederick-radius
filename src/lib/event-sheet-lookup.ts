import type { EventWithMeta } from "@/lib/loaders/events";
import { createAbortDeadline } from "@/lib/promise-deadline";

export const EVENT_LOOKUP_TIMEOUT_MS = 15_000;

/** Bound transport and body reads, including transports that ignore abort. */
export async function fetchEventSheetLookup(
  slug: string,
  parentSignal: AbortSignal,
  timeoutMs = EVENT_LOOKUP_TIMEOUT_MS,
): Promise<EventWithMeta | null> {
  const deadline = createAbortDeadline(timeoutMs, parentSignal);
  let onAbort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new DOMException("Event lookup was cancelled or timed out", "AbortError"));
    if (deadline.signal.aborted) onAbort();
    else deadline.signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    const payload = await Promise.race([
      deadline.signal.aborted ? interrupted :
        fetch(`/api/events/${encodeURIComponent(slug)}/summary?v=attendance-2`, { signal: deadline.signal })
          .then((response) => response.ok ? response.json() : null),
      interrupted,
    ]) as { event?: EventWithMeta } | null;
    return payload?.event?.slug === slug ? payload.event : null;
  } finally {
    deadline.signal.removeEventListener("abort", onAbort);
    deadline.dispose();
  }
}
