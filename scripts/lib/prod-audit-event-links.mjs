import { eventDetailPathsFromHtml } from "./prod-audit-events.mjs";

export const MAX_EVENT_LINK_WAIT_MS = 340_000;
const SURFACES = ["/today", "/events"];
const POLL_INTERVAL_MS = 20_000;

export function eventLinkWaitBudget(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, MAX_EVENT_LINK_WAIT_MS)
    : 0;
}

// Read the actual document marker, never a deployment-like serialized value.
export function pageDeploymentId(html) {
  const tag = html.match(/<html\b[^>]*>/i)?.[0] || "";
  const matches = [...tag.matchAll(/\bdata-dpl-id\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)];
  if (matches.length !== 1) return null;
  const value = matches[0][1] ?? matches[0][2];
  return /^dpl_[a-z0-9]+$/i.test(value) ? value : null;
}

function renderedPaths(pages, baseUrl) {
  const paths = new Set();
  for (const surface of SURFACES) {
    for (const path of eventDetailPathsFromHtml(pages.get(surface)?.body || "", baseUrl)) {
      paths.add(path);
    }
  }
  return [...paths].sort();
}

/**
 * Defer only an empty anchor verdict with proven runtime recovery and pinned
 * release identity. The caller still crawls every returned actual anchor.
 * Requests are ordinary canonical HTML GETs; no API, refresh, or SW probes.
 */
export async function waitForRenderedEventLinks({
  baseUrl,
  pages: originalPages,
  expectedSha,
  deployedSha,
  earlierChecksHealthy,
  recovery,
  waitMs = 0,
  requestTimeoutMs = 20_000,
  request,
  validatePage = () => true,
  now = () => performance.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  observe = () => {},
}) {
  const pages = new Map(originalPages);
  const startedAt = now();
  const budgetMs = eventLinkWaitBudget(waitMs);
  const observations = [];
  let attempts = 0;
  const receipt = (surface, result, category) => {
    const item = {
      category,
      surface,
      elapsedMs: Math.max(0, now() - startedAt),
      status: result?.status ?? null,
      cacheDate: result?.headers?.get("date") ?? null,
      cacheAge: result?.headers?.get("age") ?? null,
      cacheStatus: result?.headers?.get("x-vercel-cache") ?? null,
      cacheControl: result?.headers?.get("cache-control") ?? null,
      deploymentId: pageDeploymentId(result?.body || ""),
    };
    observations.push(item);
    observe(item);
  };
  const finish = (category, reason, paths = []) => ({
    category,
    reason,
    paths,
    pages,
    attempts,
    elapsedMs: Math.max(0, now() - startedAt),
    observations,
  });

  const initialPaths = renderedPaths(pages, baseUrl);
  if (initialPaths.length > 0) return finish("rendered", null, initialPaths);
  // Preserve the first empty observation even if a later ISR render recovers.
  for (const surface of SURFACES) receipt(surface, pages.get(surface), "initial-empty");
  if (budgetMs === 0) return finish("wait-disabled", "event-link wait budget is zero");
  if (!/^[a-f0-9]{40}$/i.test(expectedSha || "")) {
    return finish("expected-sha-required", "a full expected commit SHA is required");
  }
  if (!/^[a-f0-9]{12,40}$/i.test(deployedSha || "") ||
      !expectedSha.toLowerCase().startsWith(deployedSha.toLowerCase())) {
    return finish("deployment-mismatch", "the observed SW revision does not match the expected commit");
  }
  if (!earlierChecksHealthy) return finish("earlier-check-failed", "an earlier production check failed");
  if (recovery?.status !== 200 ||
      !(recovery.cacheControl || "").includes("no-store") ||
      !Array.isArray(recovery.payload?.events) ||
      typeof recovery.payload?.partial !== "boolean") {
    return finish("runtime-recovery-invalid", "runtime event recovery has not passed its documented contract");
  }
  if (recovery.payload.events.length === 0) {
    return finish("runtime-recovery-empty", "runtime event recovery has no current events");
  }
  if (!pages.get("/today")?.body.includes('data-today-event-recovery="true"')) {
    return finish("runtime-recovery-not-mounted", "Today has no explicit runtime recovery mount");
  }
  const deploymentIds = new Map(SURFACES.map((surface) => [
    surface, pageDeploymentId(pages.get(surface)?.body || ""),
  ]));
  if ([...deploymentIds.values()].some((id) => !id)) {
    return finish("deployment-marker-missing", "a canonical page has no deployment ID");
  }
  if (deploymentIds.get("/today") !== deploymentIds.get("/events")) {
    return finish("deployment-drift", "the canonical pages came from different deployments");
  }

  const deadline = startedAt + budgetMs;
  while (now() < deadline) {
    attempts += 1;
    for (const surface of SURFACES) {
      const remainingMs = Math.floor(deadline - now());
      if (remainingMs <= 0) return finish("deadline-expired", "no event anchors appeared within the ISR wait budget");
      let result;
      try {
        result = await request(surface, {
          accept: "text/html",
          follow: false,
          ordinary: true,
          timeoutMs: Math.min(requestTimeoutMs, remainingMs),
        });
      } catch (error) {
        const category = error?.name === "TimeoutError" || error?.name === "AbortError"
          ? "request-timeout" : "request-failed";
        receipt(surface, null, category);
        return finish(category, `${surface} HTML read failed: ${error?.message || "unknown error"}`);
      }
      if (now() > deadline) {
        receipt(surface, result, "deadline-expired");
        return finish("deadline-expired", "an HTML read exceeded the ISR wait budget");
      }
      if (result.status !== 200) {
        receipt(surface, result, "http-error");
        return finish("http-error", `${surface} returned ${result.status}`);
      }
      if (pageDeploymentId(result.body) !== deploymentIds.get(surface)) {
        receipt(surface, result, "deployment-drift");
        return finish("deployment-drift", `${surface} changed or lost its deployment ID`);
      }
      if (!validatePage(surface, result)) {
        receipt(surface, result, "page-contract-failed");
        return finish("page-contract-failed", `${surface} failed its existing HTML acceptance checks`);
      }
      pages.set(surface, result);
      receipt(surface, result, "waiting-for-isr");
    }
    const paths = renderedPaths(pages, baseUrl);
    if (paths.length > 0) return finish("recovered", null, paths);
    const remainingMs = deadline - now();
    if (remainingMs > 0) await sleep(Math.min(POLL_INTERVAL_MS, remainingMs));
  }
  return finish("deadline-expired", "no event anchors appeared within the ISR wait budget");
}
