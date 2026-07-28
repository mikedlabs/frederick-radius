/**
 * Resolve with a fallback when optional work misses its UI deadline.
 * Rejections are consumed even after the deadline so a late upstream failure
 * cannot become an unhandled rejection.
 */
export function withDeadlineFallback<T>(
  promise: Promise<T>,
  deadlineMs: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guarded = promise.catch(() => fallback);
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), deadlineMs);
  });
  return Promise.race([guarded, deadline]).finally(() => clearTimeout(timer));
}

export type DeadlineOutcome<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected" }
  | { status: "timed_out" };

/**
 * Bound an operational phase without leaking its exception into a public
 * response. Unlike a fallback value, the tagged result lets cron routes turn a
 * timeout or rejection into a red heartbeat instead of a successful no-op.
 *
 * The underlying operation should still carry its own cancellation or database
 * statement timeout when available. This helper bounds how long the route waits
 * and consumes late rejections so they cannot become unhandled.
 */
export function withDeadlineOutcome<T>(
  promise: Promise<T>,
  deadlineMs: number,
): Promise<DeadlineOutcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guarded = promise.then<DeadlineOutcome<T>, DeadlineOutcome<T>>(
    (value) => ({ status: "fulfilled", value }),
    () => ({ status: "rejected" }),
  );
  const deadline = new Promise<DeadlineOutcome<T>>((resolve) => {
    timer = setTimeout(() => resolve({ status: "timed_out" }), deadlineMs);
  });
  return Promise.race([guarded, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
