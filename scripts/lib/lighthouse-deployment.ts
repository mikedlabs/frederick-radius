export type LighthouseFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const REVISION_PATTERN = /^[a-f0-9]{7,64}$/i;

export function parseDeploymentRevision(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Production health response is not an object");
  }
  const deployment = (payload as { deployment?: unknown }).deployment;
  if (!deployment || typeof deployment !== "object") {
    throw new Error("Production health response has no deployment object");
  }
  const revision = (deployment as { revision?: unknown }).revision;
  if (typeof revision !== "string" || !REVISION_PATTERN.test(revision)) {
    throw new Error("Production health response has no valid deployment revision");
  }
  return revision.toLowerCase();
}

export async function fetchDeploymentRevision(
  base: string,
  {
    fetchImpl = fetch,
    timeoutMs = 5_000,
  }: {
    fetchImpl?: LighthouseFetch;
    timeoutMs?: number;
  } = {},
): Promise<string> {
  const endpoint = new URL("/api/health", base);
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") {
    throw new Error("Deployment revision probe requires an HTTP(S) base URL");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch {
      throw new Error(
        controller.signal.aborted
          ? `Deployment revision probe timed out after ${timeoutMs}ms`
          : "Deployment revision probe request failed",
      );
    }

    if (!response.ok) {
      throw new Error(`Deployment revision probe returned HTTP ${response.status}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(
        controller.signal.aborted
          ? `Deployment revision probe timed out after ${timeoutMs}ms`
          : "Deployment revision probe returned invalid JSON",
      );
    }
    return parseDeploymentRevision(payload);
  } finally {
    clearTimeout(timer);
  }
}

export function deploymentRevisionChange(
  before: string,
  after: string,
): string | null {
  return before === after
    ? null
    : `Production deployment changed during Lighthouse sampling (${before} -> ${after})`;
}
