import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EventSourceCircuitRegistry,
  mapEventSourcesWithConcurrency,
} from "./event-source-circuit";

type Result = {
  state: "ok" | "failed" | "disabled";
  items: string[];
};

const options = {
  classify: (result: Result) =>
    result.state === "ok"
      ? "success" as const
      : result.state === "disabled"
        ? "neutral" as const
        : "failure" as const,
  fallback: (): Result => ({ state: "failed", items: [] }),
};

describe("event source circuit", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens after failure, publishes a jittered next probe, and skips visitors", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const circuit = new EventSourceCircuitRegistry();
    const work = vi.fn(async (): Promise<Result> => ({
      state: "failed",
      items: [],
    }));

    const first = await circuit.run("feed:test", work, options);
    const expectedProbe = Date.now() + 30_000;
    expect(first).toMatchObject({
      phase: "open",
      attempted: true,
      degraded: true,
      servedStale: false,
      nextProbeAtMs: expectedProbe,
    });

    const second = await circuit.run("feed:test", work, options);
    expect(second).toMatchObject({
      phase: "open",
      attempted: false,
      degraded: true,
      nextProbeAtMs: expectedProbe,
    });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("allows one half-open probe and closes after that probe succeeds", async () => {
    let now = 1_000;
    const circuit = new EventSourceCircuitRegistry({
      baseCooldownMs: 100,
      maxCooldownMs: 1_000,
      jitterRatio: 0,
      now: () => now,
      random: () => 0.5,
    });
    const work = vi
      .fn<() => Promise<Result>>()
      .mockResolvedValueOnce({ state: "failed", items: [] })
      .mockResolvedValueOnce({ state: "ok", items: ["recovered"] });

    await circuit.run("feed:test", work, options);
    now = 1_100;
    const recovered = await circuit.run("feed:test", work, options);

    expect(recovered).toMatchObject({
      value: { state: "ok", items: ["recovered"] },
      phase: "closed",
      attempted: true,
      degraded: false,
      nextProbeAtMs: null,
    });
    expect(circuit.snapshot("feed:test")).toEqual({
      phase: "closed",
      failures: 0,
      nextProbeAtMs: null,
      hasLastGood: true,
    });
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("restores the prior circuit and stale-good value after caller cancellation", async () => {
    let now = 1_000;
    const circuit = new EventSourceCircuitRegistry({
      baseCooldownMs: 100,
      maxCooldownMs: 1_000,
      jitterRatio: 0,
      now: () => now,
    });
    const cancellableOptions = {
      classify: (result: Result | { state: "cancelled"; items: string[] }) =>
        result.state === "ok"
          ? "success" as const
          : result.state === "cancelled"
            ? "cancelled" as const
            : result.state === "disabled"
              ? "neutral" as const
              : "failure" as const,
      fallback: (): Result => ({ state: "failed", items: [] }),
    };

    await circuit.run(
      "feed:test",
      async () => ({ state: "ok" as const, items: ["last good"] }),
      cancellableOptions,
    );
    const cancelled = await circuit.run(
      "feed:test",
      async () => ({ state: "cancelled" as const, items: [] }),
      cancellableOptions,
    );

    expect(cancelled).toMatchObject({
      value: { state: "ok", items: ["last good"] },
      phase: "closed",
      attempted: true,
      degraded: true,
      servedStale: true,
    });
    expect(circuit.snapshot("feed:test")).toEqual({
      phase: "closed",
      failures: 0,
      nextProbeAtMs: null,
      hasLastGood: true,
    });

    await circuit.run(
      "feed:recovering",
      async () => ({ state: "failed" as const, items: [] }),
      cancellableOptions,
    );
    now = 1_100;
    await circuit.run(
      "feed:recovering",
      async () => ({ state: "cancelled" as const, items: [] }),
      cancellableOptions,
    );
    expect(circuit.snapshot("feed:recovering")).toEqual({
      phase: "open",
      failures: 1,
      nextProbeAtMs: 1_100,
      hasLastGood: false,
    });
  });

  it("shares one in-flight half-open probe across concurrent callers", async () => {
    let now = 1_000;
    const circuit = new EventSourceCircuitRegistry({
      baseCooldownMs: 100,
      maxCooldownMs: 1_000,
      jitterRatio: 0,
      now: () => now,
    });
    let releaseProbe: ((value: Result) => void) | undefined;
    const work = vi
      .fn<() => Promise<Result>>()
      .mockResolvedValueOnce({ state: "failed", items: [] })
      .mockImplementationOnce(
        () =>
          new Promise<Result>((resolve) => {
            releaseProbe = resolve;
          }),
      );

    await circuit.run("feed:test", work, options);
    now = 1_100;
    const firstProbe = circuit.run("feed:test", work, options);
    const sharedProbe = circuit.run("feed:test", work, options);

    expect(circuit.snapshot("feed:test").phase).toBe("half-open");
    expect(work).toHaveBeenCalledTimes(2);
    releaseProbe?.({ state: "ok", items: ["recovered"] });

    await expect(Promise.all([firstProbe, sharedProbe])).resolves.toEqual([
      expect.objectContaining({ phase: "closed", degraded: false }),
      expect.objectContaining({ phase: "closed", degraded: false }),
    ]);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("doubles failed half-open cooldowns and reuses the last good value", async () => {
    let now = 10_000;
    const random = vi.fn()
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.75);
    const circuit = new EventSourceCircuitRegistry({
      baseCooldownMs: 100,
      maxCooldownMs: 1_000,
      jitterRatio: 0.2,
      now: () => now,
      random,
    });
    const work = vi
      .fn<() => Promise<Result>>()
      .mockResolvedValueOnce({ state: "ok", items: ["known-good"] })
      .mockResolvedValue({ state: "failed", items: [] });

    await circuit.run("feed:test", work, options);
    const failed = await circuit.run("feed:test", work, options);
    expect(failed.value.items).toEqual(["known-good"]);
    expect(failed.servedStale).toBe(true);
    expect(failed.nextProbeAtMs).toBe(10_100);

    now = 10_100;
    const failedProbe = await circuit.run("feed:test", work, options);
    // Base 200 ms after the second failure, with +10% jitter.
    expect(failedProbe.nextProbeAtMs).toBe(10_320);
    expect(failedProbe.value.items).toEqual(["known-good"]);

    const skipped = await circuit.run("feed:test", work, options);
    expect(skipped.attempted).toBe(false);
    expect(skipped.value.items).toEqual(["known-good"]);
    expect(work).toHaveBeenCalledTimes(3);
  });

  it("treats an intentionally disabled adapter as neutral", async () => {
    const circuit = new EventSourceCircuitRegistry();
    const outcome = await circuit.run(
      "adapter:test",
      async () => ({ state: "disabled", items: [] } as Result),
      options,
    );

    expect(outcome).toMatchObject({
      phase: "closed",
      degraded: false,
      servedStale: false,
      nextProbeAtMs: null,
    });
    expect(circuit.snapshot("adapter:test").failures).toBe(0);
  });
});

describe("bounded event source fanout", () => {
  it("never runs more providers than the configured concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];

    const pending = mapEventSourcesWithConcurrency(
      ["a", "b", "c", "d", "e", "f"],
      3,
      async (source) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
        return source.toUpperCase();
      },
    );

    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases.splice(0, 3).forEach((release) => release());
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases.splice(0, 3).forEach((release) => release());

    await expect(pending).resolves.toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(maxActive).toBe(3);
  });
});
