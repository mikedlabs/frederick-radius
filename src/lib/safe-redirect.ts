/**
 * Normalize an untrusted redirect target to a same-origin absolute path.
 *
 * Redirect sinks should receive only the returned pathname/search/hash. The
 * helper deliberately rejects absolute URLs, protocol-relative paths,
 * backslashes (including encoded variants), control characters, and paths
 * that URL normalization turns into a protocol-relative value.
 */

const REDIRECT_BASE = new URL("https://frederick-radius.invalid");

function hasUnsafeCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (value[i] === "\\" || code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function decodedForInspection(value: string): string | null {
  let current = value;
  // Redirect values should never need nested encoding. Inspect a few layers so
  // `%255c` and `%252f%252f` cannot hide URL separators from validation.
  for (let i = 0; i < 4; i++) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) return current;
    current = next;
  }
  return current;
}

function normalizeRelativePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (hasUnsafeCharacters(raw)) return null;
  const candidate = raw.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return null;

  const inspected = decodedForInspection(candidate);
  if (
    inspected === null ||
    inspected.startsWith("//") ||
    hasUnsafeCharacters(inspected)
  ) {
    return null;
  }

  try {
    const parsed = new URL(candidate, REDIRECT_BASE);
    if (parsed.origin !== REDIRECT_BASE.origin) return null;
    if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) return null;

    // Never return an absolute URL. This also canonicalizes dot segments before
    // the value reaches NextResponse.redirect/redirect/navigation APIs.
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function safeRedirectPath(raw: unknown, fallback = "/"): string {
  return normalizeRelativePath(raw) ?? normalizeRelativePath(fallback) ?? "/";
}
