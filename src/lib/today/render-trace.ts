import "server-only";

/**
 * Temporary CI forensics for streamed Today renders.
 *
 * GitHub's browser-chaos runner has exposed a dependency that remains pending
 * after every public fallback should have settled. These markers are inert
 * outside CI and make the exact unresolved boundary visible in the web-server
 * log without changing any deadline or user-facing behavior.
 */
export async function traceTodayRender<T>(
  label: string,
  work: Promise<T>,
): Promise<T> {
  if (!process.env.CI) return work;
  const startedAt = Date.now();
  console.info(`[today-render] ${label}:start`);
  try {
    const value = await work;
    console.info(`[today-render] ${label}:settled ${Date.now() - startedAt}ms`);
    return value;
  } catch (error) {
    console.info(
      `[today-render] ${label}:rejected ${Date.now() - startedAt}ms`,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
