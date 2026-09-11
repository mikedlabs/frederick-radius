import type { PageSnapshot } from "./extract-agent";

function normalizedHostname(url: string): string | null {
  try {
    const hostname = new URL(url).hostname
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/^www\./, "");
    return hostname || null;
  } catch {
    return null;
  }
}

/**
 * Prefer encrypted first-party evidence even when an old provider record
 * still carries an http:// homepage. Keep the original URL as a compatibility
 * fallback because a small number of legacy sites genuinely do not serve TLS.
 */
export function preferredBusinessWebsiteUrls(url: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return [];
  if (parsed.protocol === "https:") return [parsed.toString()];

  const original = parsed.toString();
  parsed.protocol = "https:";
  const preferred = parsed.toString();
  return preferred === original ? [original] : [preferred, original];
}

/**
 * A business-info fetch may follow an HTTP-to-HTTPS redirect, add/remove www,
 * or land on a subdomain owned by the source site. It must not silently cross to
 * an unrelated host, where another business's prose and commerce links could
 * be attributed to the original place.
 *
 * This is intentionally conservative: parent and sibling hosts are not trusted
 * just because they share a public suffix. If a legitimate site needs that
 * later, add a narrow, reviewed source-to-destination mapping instead of a
 * global exception.
 */
export function isTrustedBusinessWebsiteRedirect(
  sourceUrl: string,
  finalUrl: string,
): boolean {
  const sourceHost = normalizedHostname(sourceUrl);
  const finalHost = normalizedHostname(finalUrl);
  if (!sourceHost || !finalHost) return false;
  return (
    sourceHost === finalHost ||
    finalHost.endsWith(`.${sourceHost}`)
  );
}

/**
 * Keep extraction batches cheap: rendering is a fallback for a missing or
 * text-thin response, not a second pass over every valid site that simply has
 * no online ordering links.
 */
export function needsRenderedBusinessSnapshot(
  snapshot: PageSnapshot | null,
  minChars: number,
): boolean {
  return !snapshot || snapshot.text.length < minChars;
}
