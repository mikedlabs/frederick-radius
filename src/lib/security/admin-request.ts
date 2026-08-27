import { NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function forbidden(): NextResponse {
  return NextResponse.json(
    { error: "Forbidden" },
    { status: 403, headers: NO_STORE_HEADERS },
  );
}

/**
 * Reject cross-origin browser requests before an authenticated admin mutation.
 *
 * Basic Auth credentials are cached by the browser and can accompany a
 * cross-origin `no-cors` request. CORS only hides the response; it does not
 * prevent the write. Modern browsers always send either Origin or Fetch
 * Metadata for these requests. The guard fails closed when neither Origin nor
 * Referer establishes the expected origin; authenticated command-line tooling
 * can send the canonical Origin explicitly.
 */
export function verifyAdminRequestOrigin(request: Request): NextResponse | null {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return null;

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") {
    return forbidden();
  }

  const suppliedOrigin =
    request.headers.get("origin") ?? request.headers.get("referer");
  if (!suppliedOrigin) return forbidden();

  try {
    if (new URL(suppliedOrigin).origin !== new URL(request.url).origin) {
      return forbidden();
    }
  } catch {
    return forbidden();
  }

  return null;
}

/** Require the non-safelisted JSON media type on admin JSON mutations. */
export function requireJsonRequest(request: Request): NextResponse | null {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType === "application/json") return null;

  return NextResponse.json(
    { error: "Content-Type must be application/json" },
    { status: 415, headers: NO_STORE_HEADERS },
  );
}
