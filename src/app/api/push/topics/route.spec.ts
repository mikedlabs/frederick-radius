import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  guardPushRead: vi.fn(),
  limit: vi.fn(),
  where: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/push-security", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/push-security")>();
  return {
    ...original,
    guardPushRead: mocks.guardPushRead,
  };
});

import { GET } from "./route";

function request() {
  return new Request(
    "https://frederickradius.app/api/push/topics?endpoint=https%3A%2F%2Fweb.push.apple.com%2Fexisting-device",
  );
}

describe("push topic registration state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardPushRead.mockResolvedValue(null);
    mocks.limit.mockResolvedValue([]);
    mocks.where.mockReturnValue({ limit: mocks.limit });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.getDb.mockReturnValue({ select: mocks.select });
  });

  it("distinguishes a successful missing-row lookup from an unavailable database", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      registered: false,
      topics: [],
    });
  });

  it("marks a stored endpoint registered and returns only public topics", async () => {
    mocks.limit.mockResolvedValue([
      { topics: ["parking", "biz:coffee-shop", "owner-alerts"] },
    ]);

    const response = await GET(request());

    await expect(response.json()).resolves.toEqual({
      registered: true,
      topics: ["parking", "biz:coffee-shop"],
    });
  });

  it("omits the registration claim when storage is not configured", async () => {
    mocks.getDb.mockReturnValue(null);

    const response = await GET(request());

    await expect(response.json()).resolves.toEqual({ topics: [] });
  });
});
