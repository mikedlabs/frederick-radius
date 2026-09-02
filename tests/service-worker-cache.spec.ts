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
  const fair = { kind: "fair" };
  const fairRedirect = { kind: "fair-redirect" };
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
    match: vi.fn(async (request: unknown) => {
      if (request === "/offline") return offline;
      if (request === "/moments/great-frederick-fair-2026") return fair;
      return undefined;
    }),
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
    Response: {
      error: () => errorResponse,
      redirect: (url: string, status: number) =>
        url === "/moments/great-frederick-fair-2026" && status === 302
          ? fairRedirect
          : errorResponse,
    },
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

  return { listeners, caches, fetch, puts, offline, fair, fairRedirect, errorResponse, openWindow, dispatchFetch };
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

  it("warms only canonical Fair HTML and same-origin static assets without credentials", async () => {
    const worker = await workerHarness();
    worker.fetch
      .mockResolvedValueOnce(
        response(
          "https://frederick.example/moments/great-frederick-fair-2026",
          "public, max-age=0, s-maxage=3600",
          [
            '<script src="/_next/static/chunks/fair-a1.js"></script>',
            '<link href="/_next/static/css/fair-b2.css" rel="stylesheet">',
            '<script src="https://evil.example/_next/static/chunks/no.js"></script>',
            '<img src="/fair/private-photo.jpg">',
          ].join(""),
        ),
      )
      .mockResolvedValueOnce(
        response("https://frederick.example/_next/static/chunks/fair-a1.js"),
      )
      .mockResolvedValueOnce(
        response("https://frederick.example/_next/static/css/fair-b2.css"),
      );
    let pending: Promise<unknown> | undefined;
    worker.listeners.get("message")!({
      data: { type: "CACHE_FAIR" },
      waitUntil(value: Promise<unknown>) {
        pending = value;
      },
    });

    await pending;
    expect(worker.fetch).toHaveBeenNthCalledWith(
      1,
      "/moments/great-frederick-fair-2026",
      { cache: "reload", credentials: "omit" },
    );
    expect(worker.fetch).toHaveBeenNthCalledWith(
      2,
      "https://frederick.example/_next/static/chunks/fair-a1.js",
      { cache: "reload", credentials: "omit" },
    );
    expect(worker.puts.map((entry) => entry.request)).toEqual([
      "/moments/great-frederick-fair-2026",
      "https://frederick.example/_next/static/chunks/fair-a1.js",
      "https://frederick.example/_next/static/css/fair-b2.css",
    ]);
  });

  it.each([
    ["https://frederick.example/beta", "public, max-age=60"],
    ["https://evil.example/moments/great-frederick-fair-2026", "public, max-age=60"],
    ["https://frederick.example/moments/great-frederick-fair-2026?private=1", "public, max-age=60"],
    ["https://frederick.example/moments/great-frederick-fair-2026", "private, max-age=60"],
    ["https://frederick.example/moments/great-frederick-fair-2026", "no-store"],
  ])("rejects an unsafe Fair warm response from %s with %s", async (url, cacheControl) => {
    const worker = await workerHarness();
    worker.fetch.mockResolvedValueOnce(response(url, cacheControl, ""));
    let pending: Promise<unknown> | undefined;
    worker.listeners.get("message")!({
      data: { type: "CACHE_FAIR" },
      waitUntil(value: Promise<unknown>) {
        pending = value;
      },
    });

    await pending;
    expect(worker.puts).toHaveLength(0);
  });

  it("caps Fair static asset warming at forty unique files", async () => {
    const worker = await workerHarness();
    const assets = Array.from(
      { length: 48 },
      (_, index) => '<script src="/_next/static/chunks/fair-' + index + '.js"></script>',
    ).join("");
    worker.fetch.mockImplementation(async (request: string) =>
      request === "/moments/great-frederick-fair-2026"
        ? response(
            "https://frederick.example/moments/great-frederick-fair-2026",
            "public, max-age=60",
            assets,
          )
        : response(request),
    );
    let pending: Promise<unknown> | undefined;
    worker.listeners.get("message")!({
      data: { type: "CACHE_FAIR" },
      waitUntil(value: Promise<unknown>) {
        pending = value;
      },
    });

    await pending;
    expect(worker.fetch).toHaveBeenCalledTimes(41);
    expect(worker.puts).toHaveLength(41);
  });

  it("uses cached canonical Fair HTML for its exact offline navigation", async () => {
    const worker = await workerHarness();
    worker.fetch.mockRejectedValueOnce(new Error("offline"));

    const handled = worker.dispatchFetch(
      "https://frederick.example/moments/great-frederick-fair-2026",
      { mode: "navigate" },
    );
    await expect(handled.result()).resolves.toBe(worker.fair);
    expect(worker.caches.match).toHaveBeenCalledWith(
      "/moments/great-frederick-fair-2026",
    );
    expect(worker.caches.match).not.toHaveBeenCalledWith("/offline");
    expect(worker.puts).toHaveLength(0);
  });

  it("preserves the /fair redirect before using canonical offline HTML", async () => {
    const worker = await workerHarness();
    worker.fetch.mockRejectedValueOnce(new Error("offline"));

    const handled = worker.dispatchFetch("https://frederick.example/fair", {
      mode: "navigate",
    });
    await expect(handled.result()).resolves.toBe(worker.fairRedirect);
    expect(worker.caches.match).toHaveBeenCalledWith(
      "/moments/great-frederick-fair-2026",
    );
    expect(worker.caches.match).not.toHaveBeenCalledWith("/offline");
    expect(worker.puts).toHaveLength(0);
  });

  it.each([
    "https://frederick.example/fair?day=1",
    "https://frederick.example/fair/",
    "https://frederick.example/moments/great-frederick-fair-2026?day=1",
    "https://frederick.example/moments/great-frederick-fair-2026/parking",
    "https://frederick.example/today",
  ])("keeps generic offline behavior for non-exact navigation %s", async (url) => {
    const worker = await workerHarness();
    worker.fetch.mockRejectedValueOnce(new Error("offline"));

    const handled = worker.dispatchFetch(url, { mode: "navigate" });
    await expect(handled.result()).resolves.toBe(worker.offline);
    expect(worker.caches.match).toHaveBeenCalledWith("/offline");
    expect(worker.caches.match).not.toHaveBeenCalledWith(
      "/moments/great-frederick-fair-2026",
    );
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
