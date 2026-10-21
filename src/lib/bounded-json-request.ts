import { createAbortDeadline } from "@/lib/promise-deadline";

type RequestOptions = { deadlineMs: number; label: string };

/** One shared flight owns its cancellation and its full-response deadline.
 * Racing the entire read also bounds transports that ignore AbortSignal or
 * return headers promptly but never finish decoding their JSON body. */
export function startBoundedJsonRequest(
  url: string,
  init: Omit<RequestInit, "signal">,
  { deadlineMs, label }: RequestOptions,
): { promise: Promise<unknown>; cancel: () => void } {
  const cancellation = new AbortController();
  const deadline = createAbortDeadline(deadlineMs, cancellation.signal);
  let onAbort: () => void;
  const stopped = new Promise<never>((_, reject) => {
    onAbort = () => reject(new DOMException(`${label} stopped before completion`, "AbortError"));
    deadline.signal.addEventListener("abort", onAbort, { once: true });
    if (deadline.signal.aborted) onAbort();
  });
  const read = (async () => {
    if (deadline.signal.aborted) throw new DOMException(`${label} stopped before completion`, "AbortError");
    const response = await fetch(url, { ...init, signal: deadline.signal });
    if (deadline.signal.aborted) {
      void response.body?.cancel().catch(() => undefined);
      throw new DOMException(`${label} stopped before completion`, "AbortError");
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error(`${label} returned ${response.status}`);
    }
    return await response.json() as unknown;
  })();
  const promise = Promise.race([read, stopped]).finally(() => {
    deadline.dispose();
    deadline.signal.removeEventListener("abort", onAbort);
  });
  return { promise, cancel: () => cancellation.abort() };
}
