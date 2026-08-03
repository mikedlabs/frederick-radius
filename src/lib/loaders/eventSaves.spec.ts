import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (work: (slug: string) => Promise<number>) => work,
}));
vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import {
  eventSaveCount,
  EVENT_SAVE_COUNT_TIMEOUT_MS,
} from "./eventSaves";

describe("event detail save count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns useful social proof without exposing tiny counts", async () => {
    mocks.getSql.mockReturnValue(vi.fn(() => Promise.resolve([{ n: 4 }])));
    await expect(eventSaveCount("alive-at-five")).resolves.toBe(4);

    mocks.getSql.mockReturnValue(vi.fn(() => Promise.resolve([{ n: 2 }])));
    await expect(eventSaveCount("small-event")).resolves.toBeNull();
  });

  it("cancels a hung optional query and lets the event page continue", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const never = Object.assign(new Promise<never>(() => undefined), {
      cancel,
    });
    mocks.getSql.mockReturnValue(vi.fn(() => never));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const pending = eventSaveCount("alive-at-five");
    await vi.advanceTimersByTimeAsync(EVENT_SAVE_COUNT_TIMEOUT_MS + 1);

    await expect(pending).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('"operation":"save-count"'));
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('"outcome":"timed_out"'));
  });

  it("degrades on a database rejection without leaking its message", async () => {
    mocks.getSql.mockReturnValue(
      vi.fn(() => Promise.reject(new Error("postgres://private-secret"))),
    );
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(eventSaveCount("alive-at-five")).resolves.toBeNull();
    const logged = warning.mock.calls.flat().join(" ");
    expect(logged).toContain('"outcome":"rejected"');
    expect(logged).not.toContain("private-secret");
  });
});
