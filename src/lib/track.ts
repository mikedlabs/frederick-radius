/**
 * track — fire a Plausible custom event, client-side.
 *
 * A no-op when Plausible isn't loaded (dev, preview, or before the script
 * hydrates), so callers never have to guard. Cookieless + privacy-first, the
 * same posture as lib/analytics.ts: event NAMES and small string/number props
 * only — never anything that identifies a person. Analytics must never throw
 * into product code, so every failure is swallowed.
 *
 * Usage: track("map_pin", { category: "coffee" })
 */
export function track(
  event: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  try {
    const plausible = (
      window as unknown as {
        plausible?: (name: string, opts?: { props?: Record<string, unknown> }) => void;
      }
    ).plausible;
    plausible?.(event, props ? { props } : undefined);
  } catch {
    /* ignore — analytics is best-effort */
  }
}
