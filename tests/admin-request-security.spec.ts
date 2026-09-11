import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as updateOwnerAlerts } from "@/app/admin/api/owner-alerts/route";
import { POST as updateResendDomain } from "@/app/admin/api/resend-domain/route";
import { POST as sendInvites } from "@/app/admin/api/send-invites/route";
import { requireJsonRequest } from "@/lib/security/admin-request";

describe("admin JSON request boundary", () => {
  it.each([
    ["owner alerts", "/admin/api/owner-alerts", updateOwnerAlerts],
    ["Resend domain", "/admin/api/resend-domain", updateResendDomain],
    ["invite sender", "/admin/api/send-invites", sendInvites],
  ])(
    "rejects a text/plain simple request before %s can mutate",
    async (_label, path, post) => {
      const response = await post(
        new NextRequest(`https://frederickradius.app${path}`, {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: JSON.stringify({ enable: true, action: "create", batch: true }),
        }),
      );

      expect(response.status).toBe(415);
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );

  it("accepts application/json with a charset", () => {
    const request = new Request("https://frederickradius.app/admin/api/example", {
      method: "POST",
      headers: { "content-type": "Application/JSON; charset=UTF-8" },
      body: "{}",
    });

    expect(requireJsonRequest(request)).toBeNull();
  });

  it("rejects a missing content type without caching the response", async () => {
    const response = requireJsonRequest(
      new Request("https://frederickradius.app/admin/api/example", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response?.status).toBe(415);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    await expect(response?.json()).resolves.toEqual({
      error: "Content-Type must be application/json",
    });
  });
});
