import { describe, it, expect } from "vitest";
import { answerCanLocalize } from "./localize";

const base = {
  hasResult: true,
  requestFailure: false,
  hasPlaceMatch: true,
  hasDevicePosition: false,
  townScoped: false,
  hasQuery: true,
};

describe("answerCanLocalize", () => {
  it("offers location on a county-wide place answer with no location (the bike-rental case)", () => {
    expect(answerCanLocalize(base)).toBe(true);
  });

  it("does NOT offer when the user already has a device position", () => {
    expect(answerCanLocalize({ ...base, hasDevicePosition: true })).toBe(false);
  });

  it("does NOT offer when a town is already pinned", () => {
    expect(answerCanLocalize({ ...base, townScoped: true })).toBe(false);
  });

  it("does NOT offer when the answer has no place matches to re-rank", () => {
    expect(answerCanLocalize({ ...base, hasPlaceMatch: false })).toBe(false);
  });

  it("does NOT offer on an errored request or before any answer/query", () => {
    expect(answerCanLocalize({ ...base, requestFailure: true })).toBe(false);
    expect(answerCanLocalize({ ...base, hasResult: false })).toBe(false);
    expect(answerCanLocalize({ ...base, hasQuery: false })).toBe(false);
  });
});
