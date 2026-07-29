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
});
