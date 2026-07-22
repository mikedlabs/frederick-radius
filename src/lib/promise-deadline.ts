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
