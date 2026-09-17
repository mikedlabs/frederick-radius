import { describe, expect, it } from "vitest";
import {
  DEFAULT_POST_AUTH_PATH,
  PROTECTED_SYNC_PATH,
  isProtectedPath,
  loginUrlFor,
  sanitizeRedirectPath,
} from "@/lib/auth-routing";

describe("sanitizeRedirectPath", () => {
  it("uses My Radius as its anonymous-safe default", () => {
    expect(DEFAULT_POST_AUTH_PATH).toBe("/my-radius");
    expect(sanitizeRedirectPath(null)).toBe("/my-radius");
  });

  it.each([
    ["/", "/"],
    ["/account", "/account"],
    ["/places/../account?tab=security#devices", "/account?tab=security#devices"],
    ["/caf\u00e9?q=coffee beans", "/caf%C3%A9?q=coffee%20beans"],
    ["/account?next=%2Fsettings", "/account?next=%2Fsettings"],
    ["/search?q=100%25", "/search?q=100%25"],
  ])("normalizes the same-origin path %s", (value, expected) => {
    expect(sanitizeRedirectPath(value)).toBe(expected);
  });

  it.each([
    "https://evil.example/account",
    "http://evil.example/account",
    "mailto:attacker@evil.example",
    "//evil.example/account",
    "///evil.example/account",
    "//user@evil.example/account",
    "/%2e%2e//evil.example/account",
    "/safe/..//evil.example/account",
  ])("rejects external and protocol-relative target %s", (value) => {
    expect(sanitizeRedirectPath(value)).toBe(DEFAULT_POST_AUTH_PATH);
  });

  it.each([
    String.raw`/\evil.example/account`,
    String.raw`\\evil.example/account`,
    String.raw`/safe\..\evil.example/account`,
    "/%5Cevil.example/account",
    "/%5c%5cevil.example/account",
    "/%255Cevil.example/account",
    "/%2F%2Fevil.example/account",
    "/%252F%252Fevil.example/account",
    "%2F%2Fevil.example/account",
  ])("rejects encoded or literal separator trick %s", (value) => {
    expect(sanitizeRedirectPath(value)).toBe(DEFAULT_POST_AUTH_PATH);
  });

  it.each([
    "/account\nhttps://evil.example",
    "/account\r",
    "/\u0000evil.example",
    "/account\u007f",
    "/%0Aevil.example",
    "/%00evil.example",
    "/%250Aevil.example",
  ])("rejects literal and encoded control characters", (value) => {
    expect(sanitizeRedirectPath(value)).toBe(DEFAULT_POST_AUTH_PATH);
  });

  it.each([
    undefined,
    false,
    0,
    {},
    [],
    "",
    "account",
    "./account",
    "../account",
    "?next=/account",
    "#account",
    " /account",
    "/%ZZ/account",
  ])("rejects non-path value %#", (value) => {
    expect(sanitizeRedirectPath(value)).toBe(DEFAULT_POST_AUTH_PATH);
  });

  it("normalizes a custom fallback and never trusts an unsafe fallback", () => {
    expect(sanitizeRedirectPath("not-a-path", "/auth/../welcome")).toBe(
      "/welcome",
    );
    expect(
      sanitizeRedirectPath("not-a-path", "https://evil.example/account"),
    ).toBe(DEFAULT_POST_AUTH_PATH);
  });
});

describe("isProtectedPath", () => {
  it.each([
    "/settings/sync",
    "/settings/sync/",
    "/settings/sync/devices",
    "/settings/sync/privacy/export",
    "/settings/sync//devices",
  ])("matches %s", (pathname) => {
    expect(isProtectedPath(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/settings",
    "/settings/syncing",
    "/settings/sync-up",
    "/Settings/sync",
    "/settings/sync?tab=privacy",
    "/settings%2Fsync",
    "//settings/sync",
  ])("does not match lookalike %s", (pathname) => {
    expect(isProtectedPath(pathname)).toBe(false);
  });

  it("exports the protected route prefix for links and copy", () => {
    expect(PROTECTED_SYNC_PATH).toBe("/settings/sync");
  });
});

describe("loginUrlFor", () => {
  it("builds a same-origin login URL with pathname and search in next", () => {
    const result = loginUrlFor(
      "https://frederickradius.app/settings/sync?tab=saved&view=grid#ignored",
    );

    expect(result.origin).toBe("https://frederickradius.app");
    expect(result.pathname).toBe("/auth/login");
    expect(result.searchParams.get("next")).toBe(
      "/settings/sync?tab=saved&view=grid",
    );
    expect(result.hash).toBe("");
  });

  it("preserves preview and local origins, including their ports", () => {
    const preview = loginUrlFor(
      new URL("https://frederick-radius-demo.vercel.app/settings/sync/devices"),
    );
    const local = loginUrlFor("http://localhost:3000/settings/sync");

    expect(preview.origin).toBe("https://frederick-radius-demo.vercel.app");
    expect(preview.searchParams.get("next")).toBe("/settings/sync/devices");
    expect(local.origin).toBe("http://localhost:3000");
    expect(local.searchParams.get("next")).toBe("/settings/sync");
  });

  it("falls back when a request pathname would itself be unsafe to reuse", () => {
    const result = loginUrlFor("https://frederickradius.app//evil.example");

    expect(result.origin).toBe("https://frederickradius.app");
    expect(result.searchParams.get("next")).toBe(DEFAULT_POST_AUTH_PATH);
  });
});
