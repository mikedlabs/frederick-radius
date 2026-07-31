const EVENT_DETAIL_PATH = /^\/events\/[a-z0-9][a-z0-9-]{2,}\/?$/i;
const NON_DETAIL_SLUGS = new Set(["browse", "calendar"]);
export const MAX_EVENT_RECOVERY_RATIO = 0.25;

function decodeAttribute(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

/**
 * Read only real server-rendered anchors. Looking for `/events/…` anywhere in
 * a Next document also matches serialized React payloads and hidden inventory,
 * which makes a focused post-deploy canary crawl data the user was never shown.
 */
export function eventDetailPathsFromHtml(html, baseUrl) {
  const base = new URL(baseUrl);
  const paths = new Set();
  const anchors = html.match(/<a\b[^>]*>/gi) ?? [];

  for (const anchor of anchors) {
    const match = anchor.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const rawHref = decodeAttribute(match?.[1] ?? match?.[2] ?? "");
    if (!rawHref) continue;

    let url;
    try {
      url = new URL(rawHref, base);
    } catch {
      continue;
    }
    const slug = url.pathname.split("/").filter(Boolean)[1]?.toLowerCase();
    if (
      url.origin !== base.origin ||
      !EVENT_DETAIL_PATH.test(url.pathname) ||
      !slug ||
      NON_DETAIL_SLUGS.has(slug)
    ) {
      continue;
    }
    paths.add(`${url.pathname.replace(/\/$/, "")}${url.search}`);
  }

  return [...paths].sort();
}

/** Bounded worker pool used by the live canary to avoid stampeding one build. */
export async function mapWithConcurrency(items, concurrency, worker) {
  const width = Math.max(1, Math.min(Math.floor(concurrency), items.length || 1));
  const results = new Array(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: width }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results;
}

export function isInternalEventDetailUrl(value, baseUrl) {
  try {
    const base = new URL(baseUrl);
    const url = new URL(value, base);
    const slug = url.pathname.split("/").filter(Boolean)[1]?.toLowerCase();
    return (
      url.origin === base.origin &&
      EVENT_DETAIL_PATH.test(url.pathname) &&
      Boolean(slug) &&
      !NON_DETAIL_SLUGS.has(slug)
    );
  } catch {
    return false;
  }
}

export function hasEventDetailEvidence(body) {
  const scripts = body.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? [];
  return scripts.some(
    (script) =>
      /\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json')/i.test(
        script,
      ) && /"@type"\s*:\s*"Event"/i.test(script),
  );
}

const GENERIC_ERROR_MARKERS = [
  "internal server error",
  "application error",
  "something glitched",
  "a piece of this page failed to render on your device",
  "page error",
  "frederick radius could not load",
  "this page could not load",
  "frederick radius could not finish loading this page",
  "something failed while loading this page",
];

/**
 * An event-specific recovery screen is acceptable only when the route still
 * fulfills its successful HTML response contract. Branding never turns a 5xx
 * into a healthy release: every server error is a hard canary failure.
 */
export function classifyEventDetailResult(result, baseUrl) {
  if (result.status >= 500 && result.status <= 599) {
    return { kind: "failure", reason: `server error: ${result.status}` };
  }

  if (!isInternalEventDetailUrl(result.url, baseUrl)) {
    return {
      kind: "failure",
      reason: `left event detail: ${result.url || "missing final URL"}`,
    };
  }

  const lower = result.body.toLowerCase();
  const genericMarker = GENERIC_ERROR_MARKERS.find((marker) =>
    lower.includes(marker),
  );
  if (genericMarker) {
    return { kind: "failure", reason: `generic error: ${genericMarker}` };
  }

  const radiusRecovery = lower.includes(
    'data-event-recovery="source-unavailable"',
  );
  const contentType = result.headers.get("content-type") || "";
  if (radiusRecovery) {
    if (
      result.status === 200 &&
      contentType.includes("text/html") &&
      !result.externalRedirect
    ) {
      return { kind: "recovery" };
    }
    return {
      kind: "failure",
      reason: `recovery state violated route contract: ${result.status}, ${contentType || "no content type"}`,
    };
  }

  if (
    result.status === 200 &&
    contentType.includes("text/html") &&
    result.body.includes("Frederick Radius") &&
    hasEventDetailEvidence(result.body) &&
    !result.externalRedirect
  ) {
    return { kind: "healthy" };
  }

  return {
    kind: "failure",
    reason: `${result.status}, ${contentType || "no content type"}, ${result.body.length} bytes`,
  };
}

export function eventDetailGateSummary(states) {
  const healthy = states.filter((state) => state.kind === "healthy").length;
  const recovery = states.filter((state) => state.kind === "recovery").length;
  const failure = states.filter((state) => state.kind === "failure").length;
  const allowedRecoveries = Math.floor(
    states.length * MAX_EVENT_RECOVERY_RATIO,
  );
  return {
    total: states.length,
    healthy,
    recovery,
    failure,
    allowedRecoveries,
    passes:
      states.length > 0 &&
      healthy > 0 &&
      failure === 0 &&
      recovery <= allowedRecoveries,
  };
}
