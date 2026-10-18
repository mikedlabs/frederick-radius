// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodayEventsRecovery, {
  TodayEventsRecoveryView,
} from "./TodayEventsRecovery";

const event = {
  slug: "alive-at-five-2026-08-27",
  title: "Alive @ Five · Kate Cosentino",
  venue: "Carroll Creek Amphitheater",
  municipality: "frederick",
  time: "5:00 PM",
  moment: "Tonight" as const,
  image: null,
  free: false,
};

describe("TodayEventsRecoveryView", () => {
  it("restores a current event pick when the server snapshot missed", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, {
        response: { partial: false, events: [event] },
      }),
    );

    expect(html).toContain("Alive @ Five · Kate Cosentino");
    expect(html).toContain('href="/events/alive-at-five-2026-08-27"');
    expect(html).toContain("1 event pick today · 1 event pick tonight · Countywide");
    expect(html).toContain('data-today-event-recovery="true"');
  });

  it("states that it is checking instead of claiming there are no events", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, { response: null }),
    );

    expect(html).toContain("Updating today&#x27;s event picks");
    expect(html).not.toContain("No events are on the calendar");
    expect(html).toContain('href="/events"');
    expect(html).not.toContain("Refreshing current picks");
  });

  it("names a failed recovery instead of looking stuck", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, {
        response: null,
        failed: true,
      }),
    );

    expect(html).toContain("Event picks are unavailable here");
    expect(html).not.toContain("Updating today&#x27;s event picks");
  });

  it("distinguishes a healthy empty shortlist from a failed archive read", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, {
        response: { events: [], partial: false },
      }),
    );

    expect(html).toContain("No picks in this brief");
    expect(html).not.toContain("Event picks are unavailable here");
  });

  it("keeps partial coverage explicit when usable rows survive", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, {
        response: { events: [event], partial: true },
      }),
    );

    expect(html).toContain("Partial coverage");
    expect(html).toContain("Alive @ Five · Kate Cosentino");
  });
});

describe("TodayEventsRecovery", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rejects a malformed optional presenter instead of rendering an invalid identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true,
      json: async () => ({ partial: false, events: [{ ...event, presenter: 42 }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(TodayEventsRecovery)));
      await vi.waitFor(() => expect(container.textContent).toContain("Event picks are unavailable here"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(container.querySelector(`a[href="/events/${event.slug}"]`)).toBeNull();
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("recovers without consuming the explicit refresh allowance", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ partial: false, events: [event] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(TodayEventsRecovery));
    });
    await vi.waitFor(() => {
      expect(container.textContent).toContain("Alive @ Five · Kate Cosentino");
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/today/events",
      expect.objectContaining({ cache: "no-store" }),
    );

    await act(async () => root.unmount());
  });
});


// These tests deliberately use transports that ignore AbortSignal. They prove
// the hydrated component's wait bound, not Next ISR or server cancellation.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function mountRecovery() {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement(TodayEventsRecovery)));
  return { container, root };
}

async function advanceRecovery(ms: number) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}

describe("TodayEventsRecovery attempt deadline", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(["fetch", "body"] as const)(
    "retries a stalled %s within the existing two-attempt limit and ignores its late result",
    async (phase) => {
      vi.useFakeTimers();
      const pending = deferred<unknown>();
      const fetchMock = vi.fn()
        .mockImplementationOnce(() => phase === "fetch"
          ? pending.promise
          : Promise.resolve({ ok: true, json: () => pending.promise }))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ partial: true, events: [event] }),
        });
      vi.stubGlobal("fetch", fetchMock);
      const { container, root } = await mountRecovery();
      try {
        const firstSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
        await advanceRecovery(3_999);
        expect(firstSignal.aborted).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(container.textContent).toContain("Updating today's event picks");
        await advanceRecovery(1);
        expect(firstSignal.aborted).toBe(true);
        await advanceRecovery(749);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await advanceRecovery(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(container.textContent).toContain(event.title);
        expect(container.textContent).toContain("Partial coverage");
        expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(false);
        for (const [url, init] of fetchMock.mock.calls) {
          expect(url).toBe("/api/today/events");
          expect(init).toMatchObject({ cache: "no-store", headers: { Accept: "application/json" } });
        }
        const late = { partial: false, events: [{ ...event, title: "Abandoned old response" }] };
        await act(async () => {
          pending.resolve(phase === "fetch" ? { ok: true, json: async () => late } : late);
          await Promise.resolve();
        });
        expect(container.textContent).toContain(event.title);
        expect(container.textContent).not.toContain("Abandoned old response");
        expect(container.textContent).toContain("Partial coverage");
      } finally {
        await act(async () => root.unmount());
      }
      // Mounted Next links can own idle timers. After unmount, neither those
      // timers nor the abandoned recovery attempt may remain alive.
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["fetch", "body"] as const)(
    "ends as unavailable after two stalled %s attempts, never as an empty calendar",
    async (phase) => {
      vi.useFakeTimers();
      const pending = deferred<unknown>();
      const fetchMock = vi.fn().mockImplementation(() => phase === "fetch"
        ? pending.promise
        : Promise.resolve({ ok: true, json: () => pending.promise }));
      vi.stubGlobal("fetch", fetchMock);
      const { container, root } = await mountRecovery();
      try {
        await advanceRecovery(4_000);
        await advanceRecovery(750);
        await advanceRecovery(4_000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls.every((call) => call[1].signal.aborted)).toBe(true);
        expect(container.textContent).toContain("Event picks are unavailable here");
        expect(container.textContent).not.toContain("Updating today's event picks");
        expect(container.textContent).not.toContain("No picks in this brief");
        expect(container.querySelector('a[href="/events"]')).not.toBeNull();
        // A late rejected body/fetch remains handled after both deadlines.
        await act(async () => {
          pending.reject(new Error("Transport rejected after deadline"));
          await Promise.resolve();
        });
        await advanceRecovery(20_000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(container.textContent).toContain("Event picks are unavailable here");
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        await act(async () => root.unmount());
      }
    },
  );

  it.each(["fetch", "body"] as const)(
    "cancels a pending %s on unmount without waiting for a cooperative transport or starting a retry",
    async (phase) => {
      vi.useFakeTimers();
      const pending = deferred<unknown>();
      const fetchMock = vi.fn().mockImplementation(() => phase === "fetch"
        ? pending.promise
        : Promise.resolve({ ok: true, json: () => pending.promise }));
      vi.stubGlobal("fetch", fetchMock);
      const { container, root } = await mountRecovery();
      const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
      await act(async () => root.unmount());
      expect(signal.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      await act(async () => {
        pending.reject(new Error("Transport rejected after unmount"));
        await Promise.resolve();
      });
      await advanceRecovery(20_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(container.textContent).toBe("");
    },
  );

  it("clears the retry delay on unmount after a degraded empty response", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ partial: true, events: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { root } = await mountRecovery();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    await advanceRecovery(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["http", "invalid", "rejected"] as const)(
    "preserves one-attempt failure for a completed %s error",
    async (failure) => {
      vi.useFakeTimers();
      const fetchMock = vi.fn().mockImplementation(async () => {
        if (failure === "rejected") throw new Error("Offline");
        return {
          ok: failure !== "http",
          json: async () => ({ partial: false, events: [{ invalid: true }] }),
        };
      });
      vi.stubGlobal("fetch", fetchMock);
      const { container, root } = await mountRecovery();
      try {
        await advanceRecovery(20_000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(container.textContent).toContain("Event picks are unavailable here");
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        await act(async () => root.unmount());
      }
    },
  );

  it.each([
    { response: { partial: false, events: [] }, text: "No picks in this brief" },
    { response: { partial: true, events: [event] }, text: "Partial coverage" },
  ])("keeps completed response semantics: $text", async ({ response, text }) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response });
    vi.stubGlobal("fetch", fetchMock);
    const { container, root } = await mountRecovery();
    try {
      await advanceRecovery(20_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain(text);
      expect(container.textContent).not.toContain("Event picks are unavailable here");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("preserves the existing two attempts for repeated degraded empty responses", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ partial: true, events: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container, root } = await mountRecovery();
    try {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await advanceRecovery(750);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(container.textContent).toContain("Event picks are unavailable here");
      expect(container.textContent).not.toContain("No picks in this brief");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await act(async () => root.unmount());
    }
  });
});


describe("Today recovery optional visual compatibility", () => {
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each([
    { label: "older cached response", visual: undefined },
    { label: "malformed optional visual", visual: { src: 42, caption: "Unknown" } },
    { label: "unapproved paid proxy", visual: { src: "/api/place-photo?name=unapproved", key: "unapproved",
      caption: "Unknown", presentation: "photo" } },
  ])("keeps event facts usable for $label without retrying or using the legacy image", async ({ visual }) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ partial: true,
      events: [{ ...event, presenter: "Fixture presenter", image: "https://unapproved.test/legacy.jpg", visual }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const { container, root } = await mountRecovery();
    try {
      await vi.waitFor(() => expect(container.querySelector(`a[href="/events/${event.slug}"]`)).not.toBeNull());
      expect(container.textContent).toContain(`Fixture presenter: ${event.title}`);
      expect(container.textContent).toContain("Partial coverage");
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("[data-event-photo-credit]")).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(container.textContent).not.toContain("Event picks are unavailable here");
    } finally { await act(async () => root.unmount()); }
  });

  it("keeps pick order and renders approved imagery on a later row", () => {
    const later = { ...event, slug: "later-event", visual: { src: "/images/seasons/fall/018.jpg",
      key: "radius-baker-park-bandshell", caption: "Venue · Baker Park", presentation: "photo" as const } };
    const html = renderToStaticMarkup(createElement(TodayEventsRecoveryView, {
      response: { partial: false, events: [event, later] },
    }));
    expect(html.indexOf(`/events/${event.slug}`)).toBeLessThan(html.indexOf("/events/later-event"));
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).toContain("Venue · Baker Park");
  });
});
