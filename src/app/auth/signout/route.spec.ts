import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createClientMock, signOutMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import { POST } from "./route";

function request() {
  return new NextRequest("https://frederickradius.app/auth/signout", {
    method: "POST",
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /auth/signout", () => {
  it("stops only this device and confirms success after Supabase does", async () => {
    signOutMock.mockResolvedValue({ error: null });
    createClientMock.mockResolvedValue({ auth: { signOut: signOutMock } });

    const response = await POST(request());
    const location = new URL(response.headers.get("location")!);

    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(303);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(location.pathname).toBe("/my-radius");
    expect(location.searchParams.get("signed_out")).toBe("1");
  });

  it("keeps the user in sync settings when Supabase returns an error", async () => {
    signOutMock.mockResolvedValue({ error: new Error("auth unavailable") });
    createClientMock.mockResolvedValue({ auth: { signOut: signOutMock } });

    const response = await POST(request());
    const location = new URL(response.headers.get("location")!);

    expect(location.pathname).toBe("/settings/sync");
    expect(location.searchParams.get("signout")).toBe("failed");
    expect(location.searchParams.has("signed_out")).toBe(false);
  });

  it("fails honestly when the Auth client itself is unavailable", async () => {
    createClientMock.mockRejectedValue(new Error("missing configuration"));

    const response = await POST(request());
    const location = new URL(response.headers.get("location")!);

    expect(location.pathname).toBe("/settings/sync");
    expect(location.searchParams.get("signout")).toBe("failed");
  });
});
