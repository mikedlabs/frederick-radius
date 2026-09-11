export const DEFAULT_POST_AUTH_PATH = "/my-radius";
export const PROTECTED_SYNC_PATH = "/settings/sync";

const SAFE_BASE_URL = new URL("https://auth-routing.invalid/");
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;
const MAX_DECODE_DEPTH = 8;

function pathPart(value: string): string {
  const queryIndex = value.indexOf("?");
  const hashIndex = value.indexOf("#");
  const end = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .reduce((smallest, index) => Math.min(smallest, index), value.length);

  return value.slice(0, end);
}

/**
 * Check the path as supplied and after percent decoding. URLSearchParams
 * already decodes once, so checking additional representations prevents a
 * second decoding step from turning an apparently local path into `//host`
 * or `/\\host`.
 */
function hasUnsafeRepresentation(value: string): boolean {
  let candidate = value;

  for (let depth = 0; depth <= MAX_DECODE_DEPTH; depth += 1) {
    if (CONTROL_CHARACTER.test(candidate)) return true;

    const pathname = pathPart(candidate);
    if (!pathname.startsWith("/")) return true;
    if (/^[\\/]{2}/.test(pathname)) return true;
    if (pathname.includes("\\")) return true;

    let decoded: string;
    try {
      decoded = decodeURIComponent(candidate);
    } catch {
      // Reject malformed encoding in the value as received. A later failure
      // can be legitimate (for example `%25` decoding to a literal `%`).
      return depth === 0;
    }

    if (decoded === candidate) return false;
    if (depth === MAX_DECODE_DEPTH) return true;
    candidate = decoded;
  }

  return true;
}

function normalizeSameOriginPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (hasUnsafeRepresentation(value)) return null;

  let parsed: URL;
  try {
    parsed = new URL(value, SAFE_BASE_URL);
  } catch {
    return null;
  }

  if (parsed.origin !== SAFE_BASE_URL.origin) return null;

  const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  return hasUnsafeRepresentation(normalized) ? null : normalized;
}

/**
 * Return a normalized, root-relative redirect target. Untrusted, external,
 * or malformed values resolve to a safe fallback instead.
 */
export function sanitizeRedirectPath(
  value: unknown,
  fallback: unknown = DEFAULT_POST_AUTH_PATH,
): string {
  return (
    normalizeSameOriginPath(value) ??
    normalizeSameOriginPath(fallback) ??
    DEFAULT_POST_AUTH_PATH
  );
}

/** Match the signed-in sync/privacy route and descendants, without lookalikes. */
export function isProtectedPath(pathname: string): boolean {
  return pathname === PROTECTED_SYNC_PATH || pathname.startsWith(`${PROTECTED_SYNC_PATH}/`);
}

/** Build the same-origin login URL while preserving the requested path. */
export function loginUrlFor(requestUrl: string | URL): URL {
  const requested =
    requestUrl instanceof URL ? new URL(requestUrl.href) : new URL(requestUrl);
  const loginUrl = new URL("/auth/login", requested.origin);
  const next = sanitizeRedirectPath(
    `${requested.pathname}${requested.search}`,
    DEFAULT_POST_AUTH_PATH,
  );

  loginUrl.searchParams.set("next", next);
  return loginUrl;
}
