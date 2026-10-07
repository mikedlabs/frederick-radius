import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  forecast: vi.fn(), alerts: vi.fn(), air: vi.fn(), generate: vi.fn(),
  configuration: null as null | { tools: { checkWeather: { execute: (input: { hours: number }) => Promise<unknown> } } },
}));
vi.mock("ai", () => ({
  tool: (definition: unknown) => definition,
  Output: { object: () => ({}) }, stepCountIs: () => () => false,
  ToolLoopAgent: class {
    constructor(configuration: NonNullable<typeof mocks.configuration>) { mocks.configuration = configuration; }
    generate = mocks.generate;
  },
}));
vi.mock("@/lib/ask/runtime-budget", () => ({
  askAgentRuntimeConfigured: () => true,
  askAiMaxOutputTokens: () => 400,
  reserveAskModelCall: vi.fn(),
}));
vi.mock("@/lib/integrations/nws", () => ({ getNwsForecast: mocks.forecast }));
vi.mock("@/lib/integrations/nws-alerts", () => ({ getNwsAlertsResult: mocks.alerts }));
vi.mock("@/lib/integrations/airnow", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/integrations/airnow")>(), getAirQuality: mocks.air,
}));
import { runRadiusAgent } from "./intelligence";
import { FREDERICK_CENTER } from "@/lib/geo";

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-07-21T19:00:00Z"));
  vi.clearAllMocks(); mocks.configuration = null;
  mocks.generate.mockResolvedValue({ output: null });
  mocks.forecast.mockResolvedValue({ asOf: "2026-07-21T19:00:00Z", hourly: [], daily: [] });
  mocks.alerts.mockResolvedValue({ available: false, alerts: [] });
  mocks.air.mockResolvedValue([]);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected external request")));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("actual Radius agent weather tool wiring", () => {
  it("propagates unavailable alerts and successful empty AQI through the registered tool", async () => {
    await runRadiusAgent("Check weather for a plan", { origin: FREDERICK_CENTER, contextLabel: "Frederick" }, { savedPlaceSlugs: [], interests: [] });
    const tools = mocks.configuration?.tools;
    expect(tools).toBeDefined();
    await expect(tools!.checkWeather.execute({ hours: 2 })).resolves.toMatchObject({
      available: true, safetySourcesCurrent: false,
      sources: {
        alerts: { available: false, fresh: false, checkedAt: null },
        airQuality: { available: true, fresh: false },
      },
      unavailableReason: "Current weather alerts and air quality could not be verified.",
    });
    expect(mocks.alerts).toHaveBeenCalledOnce();
    expect(mocks.air).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
});
