import { describe, expect, it } from "vitest";
import {
  canReserveClosureSearchAttempt,
  isTerminalClosureSearchError,
  MAX_CLOSURE_CREDITS_PER_RUN,
  MAX_CLOSURE_REQUESTS_PER_RUN,
  parseClosureDetectorArgs,
} from "../scripts/detect-closures";
import { TavilySearchError } from "../scripts/lib/tavily-search";

describe("closure detector budget controls", () => {
  it("strictly validates --limit against the immutable ceiling", () => {
    expect(parseClosureDetectorArgs(["--limit", "5"]).limit).toBe(5);
    expect(() => parseClosureDetectorArgs(["--limit"])).toThrow(
      "--limit requires a value",
    );
    expect(() => parseClosureDetectorArgs(["--limit", "5abc"])).toThrow(
      "--limit must be a positive whole number",
    );
    expect(() => parseClosureDetectorArgs(["--limit", "0"])).toThrow(
      "--limit must be a positive whole number",
    );
    expect(() =>
      parseClosureDetectorArgs([
        "--limit",
        String(MAX_CLOSURE_REQUESTS_PER_RUN + 1),
      ]),
    ).toThrow("immutable");
  });

  it("requires explicit long-tail confirmation", () => {
    expect(() => parseClosureDetectorArgs(["--all"])).toThrow(
      "--all requires --confirm-all",
    );
    expect(
      parseClosureDetectorArgs(["--all", "--confirm-all"]),
    ).toMatchObject({
      includeLongTail: true,
      confirmedLongTail: true,
    });
  });

  it("refuses another reservation at either hard ceiling", () => {
    expect(
      canReserveClosureSearchAttempt(
        MAX_CLOSURE_REQUESTS_PER_RUN - 1,
        MAX_CLOSURE_CREDITS_PER_RUN - 1,
      ),
    ).toBe(true);
    expect(
      canReserveClosureSearchAttempt(
        MAX_CLOSURE_REQUESTS_PER_RUN,
        0,
      ),
    ).toBe(false);
    expect(
      canReserveClosureSearchAttempt(
        0,
        MAX_CLOSURE_CREDITS_PER_RUN,
      ),
    ).toBe(false);
  });

  it("classifies terminal Tavily auth, rate, plan, and billing failures", () => {
    for (const code of [
      "configuration",
      "unauthorized",
      "rate_limited",
      "plan_limit_exceeded",
      "payg_limit_exceeded",
    ] as const) {
      expect(
        isTerminalClosureSearchError(
          new TavilySearchError("terminal", { code }),
        ),
      ).toBe(true);
    }
    expect(
      isTerminalClosureSearchError(
        new TavilySearchError("temporary", { code: "network_error" }),
      ),
    ).toBe(false);
  });
});
