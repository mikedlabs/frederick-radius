import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/sw.js/route";

type Listener = (event: Record<string, unknown>) => void;

function response(url: string, cacheControl = "", body?: string) {
  return {
    ok: true,
    status: 200,
    type: "basic",
    redirected: false,
    url,
    headers: { get: (name: string) => (name.toLowerCase() === "cache-control" ? cacheControl : null) },
    clone() {
      return this;
    },
    ...(body === undefined ? {} : { text: vi.fn(async () => body) }),
  };
}

async function workerHarness() {
  const source = await GET().text();
  const listeners = new Map<string, Listener>();
  const puts: Array<{ cache: string; request: unknown; value: unknown }> = [];
  const offline = { kind: "offline" };
  const errorResponse = { kind: "network-error" };

  const cacheFor = (name: string) => ({
    match: vi.fn(async () => undefined),
    put: vi.fn(async (request: unknown, value: unknown) => {
      puts.push({ cache: name, request, value });
    }),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  });
  const cacheInstances = new Map<string, ReturnType<typeof cacheFor>>();
  const caches = {
    open: vi.fn(async (name: string) => {
      if (!cacheInstances.has(name)) cacheInstances.set(name, cacheFor(name));
      return cacheInstances.get(name)!;
    }),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
    match: vi.fn(async (request: unknown) => (request === "/offline" ? offline : undefined)),
  };
  const fetch = vi.fn();
  const openWindow = vi.fn(async () => undefined);
  const self = {
    location: { origin: "https://frederick.example" },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => []),
      openWindow,
    },
    registration: { showNotification: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(),
  };

  vm.runInNewContext(source, {
    self,
    caches,
    fetch,
    Response: { error: () => errorResponse },
    URL,
    Set,
    Promise,
    decodeURIComponent,
    encodeURIComponent,
  });

  function dispatchFetch(url: string, init: Record<string, unknown> = {}) {
    let result: Promise<unknown> | undefined;
    const request = {
      method: "GET",
      mode: "cors",
      destination: "",
      cache: "default",
      headers: new Headers(),
      url,
      ...init,
    };
    listeners.get("fetch")!({
      request,
      respondWith(value: Promise<unknown>) {
        result = Promise.resolve(value);
      },
    });
    return { request, result: () => result };
  }

  return { listeners, caches, fetch, puts, offline, errorResponse, openWindow, dispatchFetch };
}

describe("service worker cache boundaries", () => {
  it("does not cache a beta/auth redirect as the offline fallback", async () => {
    const worker = await workerHarness();
    worker.fetch.mockResolvedValueOnce({
      ...response("https://frederick.example/beta"),
      redirected: true,
    });
    let pending: Promise<unknown> | undefined;
    worker.listeners.get("install")!({
      waitUntil(value: Promise<unknown>) {
        pending = value;
      },
    });

    await pending;
    expect(worker.puts).toHaveLength(0);
  });

  it("pre-caches only the generic offline page's immutable assets", async () => {
    const worker = await workerHarness();
    worker.fetch
      .mockResolvedValueOnce(
        response(
          "https://frederick.example/offline",
          "",
          [
            '<script src="/_next/static/chunks/offline-a1.js"></script>',
            '<link href="/_next/static/css/offline-b2.css" rel="stylesheet">',
            '<script src="https://evil.example/_next/static/chunks/no.js"></script>',
            '<a href="/today">Today</a>',
          ].join(""),
        ),
      )
      .mockResolvedValueOnce(
        response("https://frederick.example/_next/static/chunks/offline-a1.js"),
      )
      .mockResolvedValueOnce(
        response("https://frederick.example/_next/static/css/offline-b2.css"),
      );
    let pending: Promise<unknown> | undefined;
    worker.listeners.get("install")!({
      waitUntil(value: Promise<unknown>) {
        pending = value;
      },
    });

    await pending;
    expect(worker.puts.map((entry) => entry.request)).toEqual([
      "/offline",
      "https://frederick.example/_next/static/chunks/offline-a1.js",
      "https://frederick.example/_next/static/css/offline-b2.css",
    ]);
    expect(worker.fetch).toHaveBeenCalledTimes(3);
  });

  it("never stores navigation HTML and uses only the generic offline fallback", async () => {
    const worker = await workerHarness();
    const live = response("https://frederick.example/today");
    worker.fetch.mockResolvedValueOnce(live);

    const online = worker.dispatchFetch("https://frederick.example/today", { mode: "navigate" });
    await expect(online.result()).resolves.toBe(live);
    expect(worker.puts).toHaveLength(0);
    expect(worker.caches.match).not.toHaveBeenCalled();

    worker.fetch.mockRejectedValueOnce(new Error("offline"));
    const offline = worker.dispatchFetch("https://frederick.example/my-radius", { mode: "navigate" });
    await expect(offline.result()).resolves.toBe(worker.offline);
    expect(worker.caches.match).toHaveBeenCalledWith("/offline");
    expect(worker.puts).toHaveLength(0);
  });

  it.each([
    "https://frederick.example/auth/session.png",
    "https://frederick.example/beta/private.jpg",
    "https://frederick.example/settings/avatar.png",
    "https://frederick.example/my-radius/card.png",
    "https://frederick.example/business/manage/secret/photo.png",
    "https://frederick.example/api/push/topics?endpoint=secret",
    "https://frederick.example/photo.jpg?token=secret",
  ])("does not intercept or cache sensitive request %s", async (url) => {
    const worker = await workerHarness();
    const handled = worker.dispatchFetch(url, { destination: "image" });

    expect(handled.result()).toBeUndefined();
    expect(worker.fetch).not.toHaveBeenCalled();
    expect(worker.puts).toHaveLength(0);
  });

  it("still caches a successful public image proxy response", async () => {
    const worker = await workerHarness();
    const live = response("https://frederick.example/api/place-photo?slug=cafe");
    worker.fetch.mockResolvedValueOnce(live);

    const handled = worker.dispatchFetch(
      "https://frederick.example/api/place-photo?slug=cafe",
      { destination: "image" },
    );
    await expect(handled.result()).resolves.toBe(live);
    expect(worker.puts).toHaveLength(1);
    expect(worker.puts[0]?.cache).toMatch(/-img$/);
  });

  it("does not cache a public image response marked private", async () => {
    const worker = await workerHarness();
    const live = response(
      "https://frederick.example/api/place-photo?slug=cafe",
      "private, max-age=60",
    );
    worker.fetch.mockResolvedValueOnce(live);

    const handled = worker.dispatchFetch(
      "https://frederick.example/api/place-photo?slug=cafe",
      { destination: "image" },
    );
    await expect(handled.result()).resolves.toBe(live);
    expect(worker.puts).toHaveLength(0);
  });

  it("normalizes an unsafe push click URL to /today", async () => {
    const worker = await workerHarness();
    let pending: Promise<unknown> | undefined;
    worker.listeners.get("notificationclick")!({
      notification: {
        data: { url: "https://evil.example/phish" },
        close: vi.fn(),
      },
      waitUntil(value: Promise<unknown>) {
        pending = value;
      },
    });

    await pending;
    expect(worker.openWindow).toHaveBeenCalledWith("/today");
  });

  it("keeps a same-origin POST open ping alive with the click navigation", async () => {
    const worker = await workerHarness();
    worker.fetch.mockResolvedValueOnce(response("https://frederick.example/api/push/opened"));
    let pending: Promise<unknown> | undefined;
    worker.listeners.get("notificationclick")!({
      notification: {
        data: {
          url: "/events/alive-at-five",
          n: "11111111-1111-4111-8111-111111111111",
        },
        close: vi.fn(),
      },
      waitUntil(value: Promise<unknown>) {
        pending = value;
      },
    });

    await pending;
    expect(worker.fetch).toHaveBeenCalledWith(
      "/api/push/opened?n=11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        method: "POST",
        mode: "same-origin",
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true,
      }),
    );
    expect(worker.openWindow).toHaveBeenCalledWith("/events/alive-at-five");
  });
});
