import { describe, it, expect } from "vitest";
import { primaryAnswerFor } from "./answer";

describe("primaryAnswerFor", () => {
  it("answers 'coffee open now near me' with the nearest-open coffee surface", () => {
    const a = primaryAnswerFor("coffee open now near me");
    expect(a?.key).toBe("coffee");
    expect(a?.href).toBe("/nearby?c=coffee");
    expect(a?.kicker).toBe("Open picks; nearest when location is available");
  });

  it("resolves specific terms before the broad buckets", () => {
    expect(primaryAnswerFor("where can I get a beer")?.key).toBe("breweries");
    expect(primaryAnswerFor("pizza")?.key).toBe("food");
    expect(primaryAnswerFor("wineries near me")?.key).toBe("wineries");
    expect(primaryAnswerFor("a good hike")?.key).toBe("outside");
  });

  it("answers a bare open query with Open now", () => {
    const a = primaryAnswerFor("what's open right now");
    expect(a?.key).toBe("open-now");
    expect(a?.href).toBe("/open-now");
    expect(a?.kicker).toBe(
      "See confirmed-open places across the county.",
    );
  });

  it("does not treat 'open mic' as an open-now query", () => {
    // 'open mic' is a live-music term, and the open-now guard excludes it.
    expect(primaryAnswerFor("open mic tonight")?.key).toBe("music");
  });

  it("returns null when nothing intent-like matches", () => {
    expect(primaryAnswerFor("zzxq")).toBeNull();
    expect(primaryAnswerFor("a")).toBeNull();
  });

  it("does not mistake automotive service language for retail shopping", () => {
    expect(primaryAnswerFor("nearest auto repair shop")).toBeNull();
    expect(primaryAnswerFor("car wash near me")).toBeNull();
    expect(primaryAnswerFor("oil change")).toBeNull();
  });
});
