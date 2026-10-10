import { createAbortDeadline } from "@/lib/promise-deadline";

/** Bound a detail read through headers and JSON, even if transport ignores abort. */
export async function fetchSheetLookupJson(
  url: string,
  parentSignal: AbortSignal,
  timeoutMs: number,
): Promise<unknown> {
  const deadline = createAbortDeadline(timeoutMs, parentSignal);
  let onAbort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new DOMException("Detail lookup was cancelled or timed out", "AbortError"));
    if (deadline.signal.aborted) onAbort();
    else deadline.signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([
      deadline.signal.aborted ? interrupted :
        fetch(url, { signal: deadline.signal })
          .then((response) => response.ok ? response.json() : null),
      interrupted,
    ]);
  } finally {
    deadline.signal.removeEventListener("abort", onAbort);
    deadline.dispose();
  }
}
