import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(async () => new Response(null, { status: 200 })),
}));

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: mocks.updateSession,
}));

import { proxy } from "./proxy";

const previousBetaPassword = process.env.BETA_PASSWORD;
const previousAdminUser = process.env.ADMIN_USER;
const previousAdminPassword = process.env.ADMIN_PASSWORD;

describe("public access proxy", () => {
  beforeEach(() => {
    mocks.updateSession.mockClear();
    process.env.BETA_PASSWORD = "legacy-beta-password";
    delete process.env.ADMIN_USER;
    delete process.env.ADMIN_PASSWORD;
  });

  afterEach(() => {
    if (previousBetaPassword === undefined) delete process.env.BETA_PASSWORD;
    else process.env.BETA_PASSWORD = previousBetaPassword;
    if (previousAdminUser === undefined) delete process.env.ADMIN_USER;
    else process.env.ADMIN_USER = previousAdminUser;
    if (previousAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousAdminPassword;
  });

  it.each([
    "/",
    "/today",
    "/map?q=coffee",
    "/events",
    "/places/gravel-and-grind-frederick",
    "/submit/place",
  ])("keeps %s public even when the legacy beta password is configured", async (path) => {
    const request = new NextRequest(`https://frederickradius.app${path}`);
    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.updateSession).toHaveBeenCalledWith(request);
  });

  it("keeps the optional beta page reachable without making it the front door", async () => {
    const request = new NextRequest("https://frederickradius.app/beta");
    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.updateSession).toHaveBeenCalledWith(request);
  });

  it("continues to fail closed on admin routes", async () => {
    const response = await proxy(
      new NextRequest("https://frederickradius.app/admin"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it.each([
    ["Origin", { origin: "https://attacker.example" }],
    ["Fetch Metadata", { "sec-fetch-site": "cross-site" }],
    [
      "both browser signals",
      {
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
    ],
  ])(
    "rejects a cross-origin simple POST identified by %s after valid Basic authentication",
    async (_signal, browserHeaders) => {
      process.env.ADMIN_USER = "owner";
      process.env.ADMIN_PASSWORD = "correct horse";
      const response = await proxy(
        new NextRequest("https://frederickradius.app/admin/api/owner-alerts", {
          method: "POST",
          headers: {
            authorization: `Basic ${btoa("owner:correct horse")}`,
            "content-type": "text/plain",
            ...browserHeaders,
          },
          body: JSON.stringify({ enable: true }),
        }),
      );

      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(mocks.updateSession).not.toHaveBeenCalled();
    },
  );

  it("keeps authentication failure ahead of the admin origin check", async () => {
    process.env.ADMIN_USER = "owner";
    process.env.ADMIN_PASSWORD = "correct horse";
    const response = await proxy(
      new NextRequest("https://frederickradius.app/admin/api/owner-alerts", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("allows a same-origin authenticated admin POST", async () => {
    process.env.ADMIN_USER = "owner";
    process.env.ADMIN_PASSWORD = "correct horse";
    const response = await proxy(
      new NextRequest("https://frederickradius.app/admin/api/owner-alerts", {
        method: "POST",
        headers: {
          authorization: `Basic ${btoa("owner:correct horse")}`,
          "content-type": "application/json",
          origin: "https://frederickradius.app",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({ enable: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it("rejects an authenticated unsafe request without origin evidence", async () => {
    process.env.ADMIN_USER = "owner";
    process.env.ADMIN_PASSWORD = "correct horse";
    const response = await proxy(
      new NextRequest("https://frederickradius.app/admin/api/send-invites", {
        method: "POST",
        headers: {
          authorization: `Basic ${btoa("owner:correct horse")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ probe: "canary@example.com" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("allows authenticated tooling that declares the canonical Origin", async () => {
    process.env.ADMIN_USER = "owner";
    process.env.ADMIN_PASSWORD = "correct horse";
    const response = await proxy(
      new NextRequest("https://frederickradius.app/admin/api/send-invites", {
        method: "POST",
        headers: {
          authorization: `Basic ${btoa("owner:correct horse")}`,
          "content-type": "application/json",
          origin: "https://frederickradius.app",
        },
        body: JSON.stringify({ probe: "canary@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("accepts a same-origin Referer when Origin is unavailable", async () => {
    process.env.ADMIN_USER = "owner";
    process.env.ADMIN_PASSWORD = "correct horse";
    const response = await proxy(
      new NextRequest("https://frederickradius.app/admin/api/send-invites", {
        method: "POST",
        headers: {
          authorization: `Basic ${btoa("owner:correct horse")}`,
          "content-type": "application/json",
          referer: "https://frederickradius.app/admin/beta-emails",
        },
        body: JSON.stringify({ probe: "canary@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
