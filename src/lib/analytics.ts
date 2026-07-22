/**
 * Privacy-conscious analytics config. Plausible runs without advertising
 * cookies in this setup. It is enabled only for the production deployment,
 * which keeps local work and preview reviews out of the real site data.
 *
 * Pure on purpose: the env read lives in the component, the decision
 * lives here, so the gating logic is trivially unit-tested.
 */

// Public, site-specific tracker URL from Plausible's Site Installation screen.
// It is visible in every production page response and is not a secret.
const FREDERICK_RADIUS_SRC = "https://plausible.io/js/pa-wWMBaYS8AxxZglTw8l0Hs.js";

export type PlausibleConfig = { src: string };

export function plausibleConfig(
  env: { production?: boolean; src?: string | null } = {},
): PlausibleConfig | null {
  if (!env.production) return null;
  const src = env.src?.trim() || FREDERICK_RADIUS_SRC;
  return { src };
}
