import { createAbortDeadline } from "@/lib/promise-deadline";

/** Bound both the response and its body so recovery cannot spin indefinitely. */
export const EVENTS_BROWSE_TIMEOUT_MS = 15_000;

export async function fetchEventsBrowse(
  request: { url: string; init: RequestInit },
  timeoutMs = EVENTS_BROWSE_TIMEOUT_MS,
): Promise<unknown> {
  const callerSignal = request.init.signal;
  const deadline = createAbortDeadline(timeoutMs, callerSignal ?? undefined);
  let onAbort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(callerSignal?.aborted
      ? callerSignal.reason ?? new DOMException("Events request cancelled", "AbortError")
      : new Error("Events request timed out"));
    if (deadline.signal.aborted) onAbort();
    else deadline.signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([
      deadline.signal.aborted ? interrupted :
        fetch(request.url, { ...request.init, signal: deadline.signal })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Events request failed (${response.status})`);
            }
            return response.json();
          }),
      interrupted,
    ]);
  } finally {
    deadline.signal.removeEventListener("abort", onAbort);
    deadline.dispose();
  }
}
