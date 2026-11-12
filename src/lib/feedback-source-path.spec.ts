import { describe, expect, it } from "vitest";
import { feedbackSourcePath } from "@/lib/feedback-source-path";

describe("feedbackSourcePath", () => {
  it("keeps an ordinary page path, including the home page", () => {
    expect(feedbackSourcePath("/map")).toBe("/map");
    expect(feedbackSourcePath("/events/first-saturday?d=today#list")).toBe(
      "/events/first-saturday?d=today#list",
    );
    expect(feedbackSourcePath("/")).toBe("/");
    expect(feedbackSourcePath("  /today  ")).toBe("/today");
  });

  it.each([
    ["a protocol-relative address", "//other.example/login"],
    ["a backslash the browser treats as a slash", "/\\other.example/login"],
    ["two backslashes", "\\\\other.example"],
    ["an encoded second slash", "/%2F%2Fother.example"],
    ["an encoded backslash", "/%5Cother.example"],
    ["a doubly encoded backslash", "/%255Cother.example"],
    ["an absolute address", "https://other.example/"],
    ["a script address", "javascript:alert(1)"],
    ["a path with a control character", "/map\u0000"],
    ["a path that does not start at the root", "map"],
  ])("gives no link for %s", (_label, value) => {
    expect(feedbackSourcePath(value)).toBeNull();
  });

  it("gives no link when the note carries no usable pathname", () => {
    expect(feedbackSourcePath("")).toBeNull();
    expect(feedbackSourcePath("   ")).toBeNull();
    expect(feedbackSourcePath(null)).toBeNull();
    expect(feedbackSourcePath(undefined)).toBeNull();
    expect(feedbackSourcePath(42)).toBeNull();
    expect(feedbackSourcePath({ pathname: "/map" })).toBeNull();
  });
});
