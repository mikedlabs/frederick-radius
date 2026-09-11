const PROMOTED_MODE = "promoted";
const FETCH_GUARD_MARKER = "__radiusPromotedBuildFetchGuard";
const PROMOTED_BUILD_RUNTIME_MARKER = Symbol.for(
  "frederick-radius.promoted-data-build",
);

type Environment = Record<string, string | undefined>;
type MarkedFetch = typeof fetch & { [FETCH_GUARD_MARKER]?: true };

/** True only in the isolated `next build` child launched by package.json. */
export function isPromotedDataBuild(
  env?: Environment,
): boolean {
  // Keep the default as a direct property read. Next replaces some indirect
  // `process.env` object access while compiling static workers, which can make
  // an explicitly supplied build mode disappear inside prerendering.
  if ((env ? env.RADIUS_DATA_MODE : process.env.RADIUS_DATA_MODE) === PROMOTED_MODE) {
    return true;
  }
  if (env) return false;
  // The build wrapper preloads markers into every Next worker. `fetch` and
  // `process` cross Next's prerender VM boundary more reliably than properties
  // placed only on the outer global object. Unlike an inlined environment
  // value, these markers exist during compilation only and cannot disable live
  // refreshes in the deployed runtime.
  if (
    (globalThis.fetch as MarkedFetch | undefined)?.[FETCH_GUARD_MARKER] === true
  ) {
    return true;
  }
  if (
    (process as unknown as Record<PropertyKey, unknown>)[
      PROMOTED_BUILD_RUNTIME_MARKER
    ] === true
  ) {
    return true;
  }
  return (
    globalThis as unknown as Record<PropertyKey, unknown>
  )[PROMOTED_BUILD_RUNTIME_MARKER] === true;
}

function safeFetchTarget(input: Parameters<typeof fetch>[0]): string {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  try {
    const url = new URL(raw, "http://build.local");
    return url.origin === "http://build.local"
      ? url.pathname
      : `${url.origin}${url.pathname}`;
  } catch {
    return "unparseable URL";
  }
}

/**
 * Enforce the release boundary instead of relying on every future adapter to
 * remember a build check. Queries and fragments are intentionally omitted
 * from the error so API keys can never leak into build logs.
 */
export function installPromotedBuildFetchGuard(): void {
  if (!isPromotedDataBuild()) return;
  const currentFetch = globalThis.fetch as MarkedFetch;
  if (currentFetch[FETCH_GUARD_MARKER]) return;

  const guardedFetch: MarkedFetch = async (input) => {
    throw new Error(
      `Live fetch blocked during promoted-data build: ${safeFetchTarget(input)}`,
    );
  };
  Object.defineProperty(guardedFetch, FETCH_GUARD_MARKER, {
    value: true,
    enumerable: false,
  });
  globalThis.fetch = guardedFetch;
}
