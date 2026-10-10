/**
 * User-Agent selection for public source fetches.
 *
 * Most publishers accept an identifying Frederick Radius UA. Celebrate
 * Frederick and Visit Frederick have 403'd non-browser agents while
 * answering a browser-shaped one. The override is host-scoped so other
 * fetches stay honest about who we are.
 */

export const IDENTIFYING_SOURCE_USER_AGENT =
  "FrederickRadius/1.0 (+https://frederickradius.app)";

export const BROWSER_SOURCE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 FrederickRadius/1.0 (+https://frederickradius.app)";

const BROWSER_UA_HOSTS = [
  "celebratefrederick.com",
  "visitfrederick.org",
] as const;

export function hostNeedsBrowserUserAgent(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return BROWSER_UA_HOSTS.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

export function sourceFetchUserAgent(
  url: string,
  fallback: string = IDENTIFYING_SOURCE_USER_AGENT,
): string {
  return hostNeedsBrowserUserAgent(url) ? BROWSER_SOURCE_USER_AGENT : fallback;
}
