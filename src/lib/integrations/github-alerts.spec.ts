import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDataHealthIssueBody,
  deliverDataHealthReport,
  deliverWeeklyDigest,
} from "./github-alerts";

const GATES = [
  { name: "photos", green: false },
  { name: "transit", green: true },
  { name: "ask-canary", green: true },
];
const ANOMALIES = [
  {
    source: "google-photos",
    kind: "photo_rot" as const,
    detail: "4/6 sampled photo names failed upstream.",
  },
];

function githubResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("buildDataHealthIssueBody", () => {
  it("renders the headline, every gate with its light, and anomaly details", () => {
    const body = buildDataHealthIssueBody("2/3 green · red: photos", GATES, ANOMALIES, "Fri, Jul 17");
    expect(body).toContain("2/3 green · red: photos");
    expect(body).toContain("🔴 | `photos`");
    expect(body).toContain("🟢 | `transit`");
    expect(body).toContain("**google-photos** (`photo_rot`)");
    expect(body).toContain("/admin/data-health");
  });

  it("caps a runaway anomaly list instead of posting a wall", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      source: `feed-${i}`,
      kind: "ingest_stale" as const,
      detail: "stale",
    }));
    const body = buildDataHealthIssueBody("0/3 green", GATES, many, "Fri, Jul 17");
    expect(body).toContain("…and 8 more");
  });
});

describe("deliverDataHealthReport", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("GITHUB_ALERTS_TOKEN", "github-test-token");
    vi.stubEnv("GITHUB_ALERTS_REPO", "test-owner/test-repo");
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reports missing-token configuration without attempting GitHub", async () => {
    vi.stubEnv("GITHUB_ALERTS_TOKEN", "");
    const result = await deliverDataHealthReport({ headline: "3/3 green", gates: GATES, anomalies: [] });
    expect(result).toBe("missing_token");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      event: "github_alert_delivery_failed",
      result: "missing_token",
      action: expect.stringContaining("GITHUB_ALERTS_TOKEN"),
    });
  });

  it("preserves the successful created result", async () => {
    fetchMock
      .mockResolvedValueOnce(githubResponse([]))
      .mockResolvedValueOnce(githubResponse({ number: 42 }, 201));

    await expect(deliverDataHealthReport({
      headline: "2/3 green · red: photos",
      gates: GATES,
      anomalies: ANOMALIES,
      now: new Date("2026-07-17T12:00:00.000Z"),
    })).resolves.toBe("created");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it("stops after and reports an authentication failure", async () => {
    fetchMock.mockResolvedValueOnce(githubResponse(
      { message: "Bad credentials" },
      401,
      { "x-github-request-id": "auth-request" },
    ));

    await expect(deliverDataHealthReport({
      headline: "2/3 green",
      gates: GATES,
      anomalies: ANOMALIES,
    })).resolves.toBe("auth_failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      result: "auth_failed",
      operation: "find_open_issue",
      status: 401,
      request_id: "auth-request",
      action: expect.stringContaining("Issues read/write"),
    });
  });

  it("recognizes GitHub rate limiting and preserves reset evidence", async () => {
    fetchMock.mockResolvedValueOnce(githubResponse(
      { message: "API rate limit exceeded" },
      403,
      {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1785528000",
        "x-github-request-id": "rate-request",
      },
    ));

    await expect(deliverDataHealthReport({
      headline: "2/3 green",
      gates: GATES,
      anomalies: ANOMALIES,
    })).resolves.toBe("rate_limited");
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      result: "rate_limited",
      status: 403,
      request_id: "rate-request",
      rate_limit_reset: "1785528000",
      action: expect.stringContaining("retry"),
    });
  });

  it("recognizes a headerless secondary rate-limit response", async () => {
    fetchMock.mockResolvedValueOnce(githubResponse(
      { message: "You have exceeded a secondary rate limit." },
      403,
    ));

    await expect(deliverDataHealthReport({
      headline: "2/3 green",
      gates: GATES,
      anomalies: ANOMALIES,
    })).resolves.toBe("rate_limited");
  });

  it("distinguishes an ordinary GitHub HTTP failure", async () => {
    fetchMock.mockResolvedValueOnce(githubResponse(
      { message: "Internal Server Error" },
      500,
      { "x-github-request-id": "server-request" },
    ));

    await expect(deliverDataHealthReport({
      headline: "2/3 green",
      gates: GATES,
      anomalies: ANOMALIES,
    })).resolves.toBe("http_failed");
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      result: "http_failed",
      status: 500,
      request_id: "server-request",
    });
  });

  it("distinguishes a network failure without logging the token", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(deliverDataHealthReport({
      headline: "2/3 green",
      gates: GATES,
      anomalies: ANOMALIES,
    })).resolves.toBe("network_failed");
    const logged = String(warn.mock.calls[0]?.[0]);
    expect(JSON.parse(logged)).toMatchObject({
      result: "network_failed",
      network_kind: "request_failed",
    });
    expect(logged).not.toContain("github-test-token");
  });

  it("uses the same actionable failures for the weekly digest", async () => {
    fetchMock.mockResolvedValueOnce(githubResponse(
      { message: "slow down" },
      429,
      { "retry-after": "60" },
    ));

    await expect(deliverWeeklyDigest(
      "Weekly body",
      new Date("2026-07-20T12:00:00.000Z"),
    )).resolves.toBe("rate_limited");
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      result: "rate_limited",
      operation: "create_weekly_digest",
      retry_after: "60",
    });
  });
});
