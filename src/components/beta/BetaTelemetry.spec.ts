import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock("@/lib/track", () => ({ track: mocks.track }));

import { recordAggregateBetaActivity } from "./BetaTelemetry";

describe("recordAggregateBetaActivity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends Plausible an aggregate event with no personal code property", () => {
    recordAggregateBetaActivity();

    expect(mocks.track).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledWith("beta_active");
  });
});
