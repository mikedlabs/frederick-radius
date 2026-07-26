import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  headers: vi.fn(),
  isSameOriginMutationRequest: vi.fn(),
  isRateLimited: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/origin-check", () => ({
  isSameOriginMutationRequest: mocks.isSameOriginMutationRequest,
  isRateLimited: mocks.isRateLimited,
}));

import {
  submitPlaceAction,
  type SubmitPlaceInput,
} from "./actions";

function validPlace(
  overrides: Partial<SubmitPlaceInput> = {},
): SubmitPlaceInput {
  return {
    name: "Gravel & Grind",
    category: "coffee",
    address: "15 E 6th St",
    municipality: "frederick",
    website: "https://gravelandgrind.com",
    phone: "301-555-0100",
    description: "Coffee and bikes.",
    social_url: "",
    photo_url: "",
    photo_permission: false,
    submitter_email: "owner@example.com",
    submitter_name: "Owner",
    is_owner: true,
    contact_fax: "",
    ...overrides,
  };
}

describe("public submission server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(
      new Headers({
        host: "frederickradius.app",
        origin: "https://frederickradius.app",
        "x-forwarded-proto": "https",
        "x-real-ip": "192.0.2.10",
      }),
    );
    mocks.isSameOriginMutationRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.values.mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.getDb.mockReturnValue({ insert: mocks.insert });
    delete process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects a request that does not pass the same-origin guard", async () => {
    mocks.isSameOriginMutationRequest.mockReturnValue(false);

    await expect(submitPlaceAction(validPlace())).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("couldn’t verify"),
      retryable: true,
    });
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rate-limits the write and email path before persisting", async () => {
    mocks.isRateLimited.mockResolvedValue(true);

    await expect(submitPlaceAction(validPlace())).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("several submissions"),
      retryable: true,
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("silently accepts a bot tripwire without writing or emailing", async () => {
    const result = await submitPlaceAction(
      validPlace({ contact_fax: "301-555-9999" }),
    );

    expect(result).toMatchObject({ ok: true, token: expect.any(String) });
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("persists only the normalized, bounded payload and strips bot proof", async () => {
    const result = await submitPlaceAction(
      validPlace({ name: "  Gravel & Grind  " }),
    );

    expect(result).toMatchObject({ ok: true, token: expect.any(String) });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "place",
        submitter_email: "owner@example.com",
        payload: expect.objectContaining({ name: "Gravel & Grind" }),
      }),
    );
    const row = mocks.values.mock.calls[0]?.[0] as {
      payload?: Record<string, unknown>;
    };
    expect(row.payload).not.toHaveProperty("contact_fax");
  });

  it("rejects attacker-shaped runtime input even when TypeScript is bypassed", async () => {
    await expect(
      submitPlaceAction({
        ...validPlace(),
        website: "javascript:alert(document.domain)",
      }),
    ).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("complete http or https URL"),
      retryable: false,
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not claim production success when neither durable channel accepts the submission", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.getDb.mockReturnValue(null);

    await expect(submitPlaceAction(validPlace())).resolves.toEqual({
      ok: false,
      message:
        "We couldn’t save this submission. Your details are still in the form, so wait a moment and try again.",
      retryable: true,
    });
  });

  it("treats a successful admin email as durable delivery when the database is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    mocks.getDb.mockReturnValue(null);
    const emailFetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 202 }),
    );
    vi.stubGlobal("fetch", emailFetch);

    await expect(submitPlaceAction(validPlace())).resolves.toMatchObject({
      ok: true,
      token: expect.any(String),
    });
    expect(emailFetch).toHaveBeenCalledOnce();
  });

  it("uses the forwarded host when reconstructing a proxied Server Action request", async () => {
    mocks.headers.mockResolvedValue(
      new Headers({
        host: "internal-deployment.vercel.app",
        "x-forwarded-host": "frederickradius.app",
        origin: "https://frederickradius.app",
        "x-forwarded-proto": "https",
        "x-real-ip": "192.0.2.10",
      }),
    );

    await submitPlaceAction(validPlace());

    const request = mocks.isSameOriginMutationRequest.mock.calls[0]?.[0] as
      | Request
      | undefined;
    expect(request?.url).toBe(
      "https://frederickradius.app/__public-submission",
    );
  });
});
