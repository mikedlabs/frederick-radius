import { describe, expect, it } from "vitest";
import { createSingleFlight } from "./single-flight";

describe("createSingleFlight", () => {
  it("shares one in-flight job between concurrent callers with the same key", async () => {
    const run = createSingleFlight<string, number>();
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const work = async () => {
      calls += 1;
      await gate;
      return 42;
    };

    const first = run("events", work);
    const second = run("events", work);
    await Promise.resolve();

    expect(calls).toBe(1);
    expect(second).toBe(first);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([42, 42]);
  });

  it("clears completed and failed jobs so later calls can retry", async () => {
    const run = createSingleFlight<string, number>();
    let calls = 0;
    const work = async () => {
      calls += 1;
      if (calls === 2) throw new Error("temporary failure");
      return calls;
    };

    await expect(run("events", work)).resolves.toBe(1);
    await expect(run("events", work)).rejects.toThrow("temporary failure");
    await expect(run("events", work)).resolves.toBe(3);
  });

  it("does not coalesce different keys", async () => {
    const run = createSingleFlight<string, string>();
    const values = await Promise.all([
      run("today", async () => "today"),
      run("tomorrow", async () => "tomorrow"),
    ]);

    expect(values).toEqual(["today", "tomorrow"]);
  });
});
