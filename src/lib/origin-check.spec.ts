import { describe, expect, it } from "vitest";
import {
  isRateLimited,
  isSameOriginMutationRequest,
  readJsonBodyWithLimit,
  readTextBodyWithLimit,
} from "./origin-check";

function mutationRequest(url: string, headers?: HeadersInit): Request {
  return new Request(url, { method: "POST", headers });
}

describe("isSameOriginMutationRequest", () => {
  it("accepts production browser requests with a matching Origin or Referer", () => {
    expect(
      isSameOriginMutationRequest(
        mutationRequest("https://frederickradius.app/api/feedback", {
          origin: "https://frederickradius.app",
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginMutationRequest(
        mutationRequest("https://frederickradius.app/api/feedback", {
          referer: "https://frederickradius.app/today",
        }),
      ),
    ).toBe(true);
  });

  it("rejects missing, foreign, malformed, or conflicting production headers", () => {
    expect(
      isSameOriginMutationRequest(
        mutationRequest("https://frederickradius.app/api/feedback"),
      ),
    ).toBe(false);
    expect(
      isSameOriginMutationRequest(
        mutationRequest("https://frederickradius.app/api/feedback", {
          origin: "https://example.com",
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginMutationRequest(
        mutationRequest("https://frederickradius.app/api/feedback", {
          origin: "null",
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginMutationRequest(
        mutationRequest("https://frederickradius.app/api/feedback", {
          origin: "https://example.com",
          referer: "https://frederickradius.app/today",
        }),
      ),
    ).toBe(false);
  });

  it("accepts matching project previews and localhost requests", () => {
    const preview = "https://frederick-radius-a1b2c3-mikedlab.vercel.app";
    expect(
      isSameOriginMutationRequest(
        mutationRequest(`${preview}/api/feedback`, { origin: preview }),
      ),
    ).toBe(true);
    expect(
      isSameOriginMutationRequest(
        mutationRequest("http://localhost:3000/api/feedback"),
      ),
    ).toBe(true);
    expect(
      isSameOriginMutationRequest(
        mutationRequest("http://localhost:3000/api/feedback", {
          origin: "http://localhost:3001",
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginMutationRequest(
        mutationRequest("http://localhost:3000/api/feedback", {
          origin: "http://127.0.0.1:3000",
          referer: "http://127.0.0.1:3000/today",
        }),
      ),
    ).toBe(true);
  });
});

describe("readJsonBodyWithLimit", () => {
  it("parses a JSON body below the byte limit", async () => {
    const request = new Request("https://frederickradius.app/api/feedback", {
      method: "POST",
      body: JSON.stringify({ message: "hello" }),
    });

    await expect(readJsonBodyWithLimit(request, 128)).resolves.toEqual({
      ok: true,
      value: { message: "hello" },
    });
  });

  it("rejects a declared oversized body before reading it", async () => {
    const request = new Request("https://frederickradius.app/api/feedback", {
      method: "POST",
      headers: { "content-length": "1000" },
      body: "{}",
    });

    await expect(readJsonBodyWithLimit(request, 128)).resolves.toEqual({
      ok: false,
      error: "body-too-large",
    });
    expect(request.bodyUsed).toBe(false);
  });

  it("stops a chunked body that crosses the byte limit", async () => {
    const request = new Request("https://frederickradius.app/api/feedback", {
      method: "POST",
      body: JSON.stringify({ message: "this body is intentionally too long" }),
    });

    await expect(readJsonBodyWithLimit(request, 16)).resolves.toEqual({
      ok: false,
      error: "body-too-large",
    });
  });

  it("distinguishes malformed JSON from an oversized body", async () => {
    const request = new Request("https://frederickradius.app/api/feedback", {
      method: "POST",
      body: "not-json",
    });

    await expect(readJsonBodyWithLimit(request, 128)).resolves.toEqual({
      ok: false,
      error: "invalid-json",
    });
  });
});

describe("readTextBodyWithLimit", () => {
  it("reads a small URL-encoded form", async () => {
    const request = new Request("https://frederickradius.app/api/beta", {
      method: "POST",
      body: "password=frederick-abcd&next=%2Ftoday",
    });

    await expect(readTextBodyWithLimit(request, 128)).resolves.toEqual({
      ok: true,
      value: "password=frederick-abcd&next=%2Ftoday",
    });
  });

  it("rejects a chunked form as soon as it crosses the cap", async () => {
    const request = new Request("https://frederickradius.app/api/beta", {
      method: "POST",
      body: `password=${"x".repeat(256)}`,
    });

    await expect(readTextBodyWithLimit(request, 32)).resolves.toEqual({
      ok: false,
      error: "body-too-large",
    });
  });
});

describe("isRateLimited fallback", () => {
  it("retains a per-instance limit when KV is not configured", async () => {
    const oldUrl = process.env.KV_REST_API_URL;
    const oldToken = process.env.KV_REST_API_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    try {
      const request = new Request("https://frederickradius.app/api/feedback", {
        headers: { "x-forwarded-for": "203.0.113.44" },
      });
      const bucket = `fallback-test-${Date.now()}`;
      await expect(isRateLimited(request, bucket, 2, 60)).resolves.toBe(false);
      await expect(isRateLimited(request, bucket, 2, 60)).resolves.toBe(false);
      await expect(isRateLimited(request, bucket, 2, 60)).resolves.toBe(true);
    } finally {
      if (oldUrl === undefined) delete process.env.KV_REST_API_URL;
      else process.env.KV_REST_API_URL = oldUrl;
      if (oldToken === undefined) delete process.env.KV_REST_API_TOKEN;
      else process.env.KV_REST_API_TOKEN = oldToken;
    }
  });
});
