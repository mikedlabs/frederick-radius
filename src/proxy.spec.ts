import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { updateSessionMock } = vi.hoisted(() => ({
  updateSessionMock: vi.fn(),
}));

vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: updateSessionMock,
}));

import { proxy } from "@/proxy";

function request(path: string) {
  return new NextRequest(`https://frederickradius.app${path}`);
}

function session(
  req: NextRequest,
  authState: "authenticated" | "anonymous" | "unavailable",
  hadSessionCookie = false,
) {
  return {
    response: NextResponse.next({ request: req }),
    authState,
    hadSessionCookie,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_USER;
  delete process.env.ADMIN_PASSWORD;
});

describe("proxy auth routing", () => {
  it("keeps public My Radius available without a session", async () => {
    const req = request("/my-radius");
    updateSessionMock.mockResolvedValue(session(req, "anonymous"));

    const response = await proxy(req);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects the protected sync route and preserves its full intent", async () => {
    const req = request("/settings/sync?tab=privacy&from=my-radius");
    updateSessionMock.mockResolvedValue(session(req, "anonymous"));

    const response = await proxy(req);
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.origin).toBe("https://frederickradius.app");
    expect(location.pathname).toBe("/auth/login");
    expect(location.searchParams.get("next")).toBe(
      "/settings/sync?tab=privacy&from=my-radius",
    );
    expect(location.searchParams.get("reason")).toBe("sign_in_required");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("explains an invalid existing session without exposing the route", async () => {
    const req = request("/settings/sync");
    updateSessionMock.mockResolvedValue(session(req, "anonymous", true));

    const response = await proxy(req);
    const location = new URL(response.headers.get("location")!);

    expect(location.searchParams.get("reason")).toBe("session_ended");
  });

  it("allows an authenticated request through to the protected page", async () => {
    const req = request("/settings/sync");
    updateSessionMock.mockResolvedValue(session(req, "authenticated", true));

    const response = await proxy(req);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not mistake a settings lookalike for a protected route", async () => {
    const req = request("/settings/syncing");
    updateSessionMock.mockResolvedValue(session(req, "anonymous"));

    const response = await proxy(req);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps the admin boundary fail-closed and separate from Supabase", async () => {
    const response = await proxy(request("/admin/claims"));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
    expect(updateSessionMock).not.toHaveBeenCalled();
  });
});
