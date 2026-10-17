import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  captureRequestError: vi.fn(),
}));

import { register } from "./instrumentation";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("instrumentation startup", () => {
  it("keeps Sentry client tracing out of the shared /today and /events chunk", () => {
    const source = readFileSync("src/instrumentation-client.ts", "utf8");
    const nextConfig = readFileSync("next.config.ts", "utf8");
    expect(source).toContain('void import("@sentry/nextjs")');
    expect(source).toContain("tracesSampleRate: 0");
    expect(source).toContain("export function onRouterTransitionStart() {}");
    expect(source).not.toContain("captureRouterTransitionStart");
    expect(source).not.toMatch(/^import \* as Sentry from "@sentry\/nextjs"/m);
    expect(nextConfig).toContain("excludeTracing: true");
  });

  it("does not issue a cache-warm HTTP request on a Node cold start", () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "frederickradius.app");
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    register();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("installs the promoted-build fetch boundary before Sentry setup", async () => {
    vi.stubEnv("RADIUS_DATA_MODE", "promoted");
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    register();

    await expect(fetch("https://publisher.example/feed?token=secret")).rejects.toThrow(
      "https://publisher.example/feed",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
