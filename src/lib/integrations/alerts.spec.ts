import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Anomaly } from "./feed-snapshot";
import {
  _resetAlertThrottle,
  sendAnomalyAlert,
} from "./alerts";

const ANOMALY: Anomaly = {
  source: "test-feed",
  kind: "ingest_stale",
  detail: "The test feed is stale.",
};

describe("sendAnomalyAlert", () => {
  beforeEach(() => {
    _resetAlertThrottle();
    delete process.env.SLACK_WEBHOOK_URL;
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("distinguishes no work and missing configuration", async () => {
    await expect(sendAnomalyAlert([])).resolves.toBe("not_needed");
    await expect(sendAnomalyAlert([ANOMALY])).resolves.toBe(
      "not_configured",
    );
  });

  it("reports provider acceptance and suppresses only a repeated accepted alert", async () => {
    vi.stubEnv(
      "SLACK_WEBHOOK_URL",
      " https://hooks.slack.com/services/T/B/secret ",
    );
    const fetchMock = vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      expect(input).toBeTruthy();
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("ok", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendAnomalyAlert([ANOMALY])).resolves.toBe("accepted");
    await expect(sendAnomalyAlert([ANOMALY])).resolves.toBe("suppressed");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://hooks.slack.com/services/T/B/secret",
    );
  });

  it("keeps HTTP rejection retryable", async () => {
    vi.stubEnv(
      "SLACK_WEBHOOK_URL",
      "https://hooks.slack.com/services/T/B/secret",
    );
    const fetchMock = vi.fn(async () => new Response("no", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendAnomalyAlert([ANOMALY])).resolves.toBe("rejected");
    await expect(sendAnomalyAlert([ANOMALY])).resolves.toBe("rejected");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("distinguishes timeouts from other transport failures", async () => {
    vi.stubEnv(
      "SLACK_WEBHOOK_URL",
      "https://hooks.slack.com/services/T/B/secret",
    );
    const timeout = Object.assign(new Error("timed out"), {
      name: "TimeoutError",
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(timeout)
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendAnomalyAlert([ANOMALY])).resolves.toBe("timeout");
    await expect(sendAnomalyAlert([ANOMALY])).resolves.toBe("failed");
  });
});
