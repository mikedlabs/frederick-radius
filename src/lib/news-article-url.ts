/** Keep article outlinks explicit and limited to HTTP(S), without rewriting them. */
export function newsArticleUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  // URL() normalizes shorthand, backslashes and control characters; those are
  // not the publisher's explicit article URL and should not become an outlink.
  if (!/^https?:\/\/[^/\\]/i.test(url) || /[\u0000-\u0020\u007f\\]/.test(url)) return null;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "https:" || parsed.protocol === "http:")
      && parsed.hostname && !parsed.username && !parsed.password ? url : null;
  } catch {
    return null;
  }
}
