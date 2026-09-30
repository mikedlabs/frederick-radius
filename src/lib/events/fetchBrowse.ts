/** Bound both the response and its body so recovery cannot spin indefinitely. */
export const EVENTS_BROWSE_TIMEOUT_MS = 15_000;

export async function fetchEventsBrowse(
  request: { url: string; init: RequestInit },
  timeoutMs = EVENTS_BROWSE_TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Events request timed out"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetch(request.url, { ...request.init, signal: controller.signal })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Events request failed (${response.status})`);
          }
          return response.json();
        }),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
