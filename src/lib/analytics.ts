/**
 * Privacy-first analytics config. Plausible is cookieless and stores no
 * personal data, so no consent banner is required -- the public-sector
 * data-sensibility fit. Off unless a domain is configured, which keeps
 * it fully inert in dev/preview and makes self-hosting a no-code env
 * change (point src at your own instance).
 *
 * Pure on purpose: the env read lives in the component, the decision
 * lives here, so the gating logic is trivially unit-tested.
 */

const DEFAULT_SRC = "https://plausible.io/js/script.js";

export type PlausibleConfig = { src: string; domain: string };

export function plausibleConfig(
  env: { domain?: string | null; src?: string | null } = {},
): PlausibleConfig | null {
  const domain = env.domain?.trim();
  if (!domain) return null;
  const src = env.src?.trim() || DEFAULT_SRC;
  return { src, domain };
}
