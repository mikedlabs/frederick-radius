import http from "node:http";
import https from "node:https";

const GUARD_MARKER = Symbol.for("frederick-radius.promoted-build-network-guard");
const MODE_MARKER = Symbol.for("frederick-radius.promoted-data-build");
const FETCH_GUARD_MARKER = "__radiusPromotedBuildFetchGuard";

function sanitizedTarget(value) {
  const raw = value instanceof URL
    ? value.href
    : typeof value === "string"
      ? value
      : value?.href ?? value?.hostname ?? value?.host ?? "unknown target";
  try {
    const parsed = new URL(String(raw), "http://build.local");
    return parsed.origin === "http://build.local"
      ? parsed.pathname
      : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "unparseable target";
  }
}

function liveNetworkError(target) {
  return new Error(
    `External network blocked during promoted-data build: ${sanitizedTarget(target)}`,
  );
}

function installRequestGuard(module) {
  const blockedRequest = (...args) => {
    throw liveNetworkError(args[0]);
  };
  module.request = blockedRequest;
  module.get = blockedRequest;
}

if (
  process.env.RADIUS_DATA_MODE === "promoted" &&
  !globalThis[GUARD_MARKER]
) {
  const blockedFetch = async (input) => {
    throw liveNetworkError(input);
  };
  Object.defineProperty(blockedFetch, FETCH_GUARD_MARKER, {
    value: true,
    enumerable: false,
  });
  globalThis.fetch = blockedFetch;
  installRequestGuard(http);
  installRequestGuard(https);
  Object.defineProperty(process, MODE_MARKER, {
    value: true,
    enumerable: false,
  });
  Object.defineProperty(globalThis, MODE_MARKER, {
    value: true,
    enumerable: false,
  });
  Object.defineProperty(globalThis, GUARD_MARKER, {
    value: true,
    enumerable: false,
  });
}
