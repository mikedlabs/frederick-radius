import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps a same-origin pathname, search, and hash", () => {
    expect(safeRedirectPath("/places/cafe?from=today#details", "/today")).toBe(
      "/places/cafe?from=today#details",
    );
  });

  it("canonicalizes dot segments before returning the path", () => {
    expect(safeRedirectPath("/places/../today?view=list#now")).toBe(
      "/today?view=list#now",
    );
  });

  it("allows an encoded URL when it is only a query value", () => {
    expect(safeRedirectPath("/search?q=https%3A%2F%2Fexample.com")).toBe(
      "/search?q=https%3A%2F%2Fexample.com",
    );
  });

  it.each([
    "https://evil.example/path",
    "javascript:alert(1)",
    "//evil.example/path",
    "///evil.example/path",
    "\\\\evil.example\\path",
    "/\\evil.example/path",
    "/places\\evil",
    "/today\nextra",
    "/%5cevil.example/path",
    "/%255cevil.example/path",
    "/%2f%2fevil.example/path",
    "/%252f%252fevil.example/path",
    "/places/..//evil.example/path",
    "/bad%encoding",
  ])("rejects unsafe target %s", (target) => {
    expect(safeRedirectPath(target, "/today")).toBe("/today");
  });

  it("does not trust an unsafe fallback", () => {
    expect(safeRedirectPath("https://evil.example", "//also-evil.example")).toBe("/");
  });
});
