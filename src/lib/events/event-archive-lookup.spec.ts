import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import {
  EventIdentityStoreUnavailableError,
  type ArchivedEventIdentity,
} from "@/lib/events/event-identity";
import { createEventArchiveLookup } from "./event-archive-lookup";

function snapshot(slug = "current-event-2026-08-14"): EventWithMeta {
  return {
    slug,
    title: "Current event",
    description: "A source-backed Frederick County event.",
    starts_at: "2026-08-14T22:00:00.000Z",
    ends_at: "2026-08-15T00:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Test venue",
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "community",
    audience: [],
    is_free: true,
    source: "celebrate",
    is_verified: false,
    source_id: "stable-publisher-uid",
    source_url: "https://example.com/event",
    license: "test",
    first_seen_at: "2026-08-01T12:00:00.000Z",
    last_verified_at: "2026-08-03T12:00:00.000Z",
    confidence: "partner",
    geo_confidence: "exact_address",
    category_name: "Community",
    municipality_name: "Frederick",
  };
}

function stored(event = snapshot()): ArchivedEventIdentity {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    canonicalSlug: event.slug,
    event,
    tombstoned: false,
    lastSeenAt: "2026-08-03T12:00:00.000Z",
  };
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const config = () => ({
  supabaseUrl: "https://radius-test.supabase.co",
  publishableKey: "sb_publishable_public-test-key",
});

describe("event archive Data API lookup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["constructor", "prototype", "Uppercase", "bad slug", "x".repeat(201)])(
    "rejects unsafe slug %s before either transport",
    async (slug) => {
      const fetchImpl = vi.fn();
      const directRead = vi.fn();
      const lookup = createEventArchiveLookup({
        fetchImpl,
        directRead,
        getConfig: config,
      });

      await expect(lookup(slug)).resolves.toBeNull();
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(directRead).not.toHaveBeenCalled();
    },
  );

  it("returns a validated public snapshot without opening a database connection", async () => {
    const current = snapshot();
    const fetchImpl = vi.fn(
      async (
        _input: string | URL,
        _init?: RequestInit & { next?: { revalidate: number } },
      ) => {
        void _input;
        void _init;
        return response([
          {
            canonical_slug: current.slug,
            snapshot: current,
          },
        ]);
      },
    );
    const directRead = vi.fn();
    const lookup = createEventArchiveLookup({
      fetchImpl,
      directRead,
      getConfig: config,
    });

    await expect(lookup(current.slug, { timeoutMs: 2_250 })).resolves.toEqual({
      canonicalSlug: current.slug,
      event: current,
    });
    expect(directRead).not.toHaveBeenCalled();

    const [input, init] = fetchImpl.mock.calls[0];
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    expect(url.pathname).toBe("/rest/v1/rpc/public_event_archive_by_slug");
    expect(url.searchParams.get("requested_slug")).toBe(current.slug);
    expect(url.toString()).not.toContain(config().publishableKey);
    expect(headers.get("apikey")).toBe(config().publishableKey);
    expect(headers.has("authorization")).toBe(false);
    expect(init?.body).toBeUndefined();
    expect(init?.next).toEqual({ revalidate: 60 });
  });

  it("rebinds a historical alias snapshot to its canonical route", async () => {
    const canonical = snapshot("new-event-title-2026-08-14");
    const fetchImpl = vi.fn(async () =>
      response([
        {
          canonical_slug: canonical.slug,
          snapshot: { ...canonical, slug: "old-event-title-2026-08-14" },
        },
      ]),
    );
    const lookup = createEventArchiveLookup({
      fetchImpl,
      directRead: vi.fn(),
      getConfig: config,
    });

    await expect(
      lookup("old-event-title-2026-08-14", { timeoutMs: 2_250 }),
    ).resolves.toMatchObject({
      canonicalSlug: canonical.slug,
      event: { slug: canonical.slug },
    });
  });

  it("uses the direct archive when Data API configuration is absent", async () => {
    const direct = stored();
    const directRead = vi.fn(async () => direct);
    const fetchImpl = vi.fn();
    const lookup = createEventArchiveLookup({
      fetchImpl,
      directRead,
      getConfig: () => null,
      now: () => 1_000,
    });

    await expect(
      lookup(direct.canonicalSlug, { timeoutMs: 1_400 }),
    ).resolves.toEqual(direct);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(directRead).toHaveBeenCalledWith(direct.canonicalSlug, {
      timeoutMs: 1_400,
    });
  });

  it("uses the direct archive when the configured Data API URL is malformed", async () => {
    const direct = stored(snapshot("malformed-config-event-2026-08-14"));
    const directRead = vi.fn(async () => direct);
    const fetchImpl = vi.fn();
    const lookup = createEventArchiveLookup({
      fetchImpl,
      directRead,
      getConfig: () => ({
        supabaseUrl: "://not-a-url",
        publishableKey: "sb_publishable_public-test-key",
      }),
      now: () => 1_000,
    });

    await expect(
      lookup(direct.canonicalSlug, { timeoutMs: 1_400 }),
    ).resolves.toEqual(direct);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(directRead).toHaveBeenCalledOnce();
  });

  it.each([
    ["empty", () => response([])],
    ["not authorized", () => response({ message: "denied" }, 401)],
    ["missing RPC", () => response({ message: "missing" }, 404)],
    ["rate limited", () => response({ message: "later" }, 429)],
    ["server failure", () => response({ message: "later" }, 503)],
    ["malformed payload", () => response({ canonical_slug: "not-an-array" })],
    [
      "malformed snapshot",
      () => response([{ canonical_slug: "bad-event-2026-08-14", snapshot: {} }]),
    ],
  ])("falls back after a %s Data API response", async (_label, makeResponse) => {
    const direct = stored(snapshot("fallback-event-2026-08-14"));
    const directRead = vi.fn(async () => direct);
    const lookup = createEventArchiveLookup({
      fetchImpl: vi.fn(async () => makeResponse()),
      directRead,
      getConfig: config,
      now: () => 1_000,
    });

    await expect(
      lookup(direct.canonicalSlug, { timeoutMs: 1_500 }),
    ).resolves.toEqual(direct);
    expect(directRead).toHaveBeenCalledOnce();
  });

  it("falls back after a network failure and preserves the shared deadline", async () => {
    const direct = stored(snapshot("budgeted-event-2026-08-14"));
    const directRead = vi.fn(async () => direct);
    const clock = vi
      .fn<() => number>()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_280);
    const lookup = createEventArchiveLookup({
      fetchImpl: vi.fn(async () => {
        throw new TypeError("network unavailable");
      }),
      directRead,
      getConfig: config,
      now: clock,
    });

    await expect(
      lookup(direct.canonicalSlug, { timeoutMs: 1_000 }),
    ).resolves.toEqual(direct);
    expect(directRead).toHaveBeenCalledWith(direct.canonicalSlug, {
      timeoutMs: 720,
    });
  });

  it("aborts a slow Data API read before using the remaining direct budget", async () => {
    vi.useFakeTimers();
    try {
      const direct = stored(snapshot("slow-api-event-2026-08-14"));
      const directRead = vi.fn(async () => direct);
      const fetchImpl = vi.fn(
        (_input: string | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      );
      const lookup = createEventArchiveLookup({
        fetchImpl,
        directRead,
        getConfig: config,
        apiTimeoutMs: 25,
        now: Date.now,
      });
      const pending = lookup(direct.canonicalSlug, { timeoutMs: 1_000 });

      await vi.advanceTimersByTimeAsync(25);

      await expect(pending).resolves.toEqual(direct);
      expect(directRead).toHaveBeenCalledWith(direct.canonicalSlug, {
        timeoutMs: 975,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats an already-aborted lookup as unavailable, not missing", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    const directRead = vi.fn();
    const lookup = createEventArchiveLookup({
      fetchImpl,
      directRead,
      getConfig: config,
    });

    await expect(
      lookup("aborted-event-2026-08-14", { signal: controller.signal }),
    ).rejects.toBeInstanceOf(EventIdentityStoreUnavailableError);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(directRead).not.toHaveBeenCalled();
  });

  it("treats caller cancellation during Data API work as unavailable", async () => {
    const controller = new AbortController();
    const directRead = vi.fn();
    const fetchImpl = vi.fn(
      (_input: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const lookup = createEventArchiveLookup({
      fetchImpl,
      directRead,
      getConfig: config,
    });
    const pending = lookup("cancelled-read-event-2026-08-14", {
      signal: controller.signal,
      timeoutMs: 1_000,
    });

    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(
      EventIdentityStoreUnavailableError,
    );
    expect(directRead).not.toHaveBeenCalled();
  });

  it("does not turn two unavailable transports into a false miss", async () => {
    const lookup = createEventArchiveLookup({
      fetchImpl: vi.fn(async () => response({ message: "later" }, 503)),
      directRead: vi.fn(async () => {
        throw new EventIdentityStoreUnavailableError();
      }),
      getConfig: config,
      now: () => 1_000,
    });

    await expect(
      lookup("unavailable-event-2026-08-14", { timeoutMs: 1_000 }),
    ).rejects.toBeInstanceOf(EventIdentityStoreUnavailableError);
  });

  it("does not start the direct read after the total deadline is spent", async () => {
    const directRead = vi.fn();
    const clock = vi
      .fn<() => number>()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_100);
    const lookup = createEventArchiveLookup({
      fetchImpl: vi.fn(async () => response([], 200)),
      directRead,
      getConfig: config,
      now: clock,
    });

    await expect(
      lookup("deadline-event-2026-08-14", { timeoutMs: 1_000 }),
    ).rejects.toBeInstanceOf(EventIdentityStoreUnavailableError);
    expect(directRead).not.toHaveBeenCalled();
  });
});
