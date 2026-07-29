import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLiveEventsForSources,
  withLiveEventFetchSession,
} from "./ical-live";
import { publicEventSourceCircuits } from "./event-source-circuit";

const ICAL = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:inside-60",
  "DTSTART:20260827T180000Z",
  "DTEND:20260827T200000Z",
  "SUMMARY:Inside sixty days",
  "LOCATION:Carroll Creek Amphitheater, Frederick, MD",
  "URL:https://example.com/inside-60",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:inside-90",
  "DTSTART:20261011T180000Z",
  "DTEND:20261011T200000Z",
  "SUMMARY:Inside ninety days",
  "LOCATION:Carroll Creek Amphitheater, Frederick, MD",
  "URL:https://example.com/inside-90",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("warm-event live fetch session", () => {
  beforeEach(() => {
    publicEventSourceCircuits.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("pulls one widest source window and preserves narrower event counts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00.000Z"));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(ICAL, {
          status: 200,
          headers: { "content-type": "text/calendar" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await withLiveEventFetchSession(async () => {
      // Deliberately sequential: the old active-only single-flight cleared
      // after the first response and repeated this source for each cache fill.
      const live60 = await getLiveEventsForSources(["celebrate"], 60);
      const live90 = await getLiveEventsForSources(["celebrate"], 90);
      const second60 = await getLiveEventsForSources(["celebrate"], 60);
      return { live60, live90, second60 };
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.live60.events.map((event) => event.id)).toEqual([
      "inside-60",
    ]);
    expect(result.second60.events.map((event) => event.id)).toEqual([
      "inside-60",
    ]);
    expect(result.live90.events.map((event) => event.id)).toEqual([
      "inside-60",
      "inside-90",
    ]);
    expect(result.live60.sources_succeeded).toEqual(["celebrate"]);
    expect(result.live90.sources_succeeded).toEqual(["celebrate"]);
  });

  it("shares one failed source result across windows without retrying it", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("upstream unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await withLiveEventFetchSession(async () => ({
      live60: await getLiveEventsForSources(["celebrate"], 60),
      live90: await getLiveEventsForSources(["celebrate"], 90),
    }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.live60).toMatchObject({
      events: [],
      sources_succeeded: [],
      sources_failed: ["celebrate"],
    });
    expect(result.live90).toMatchObject({
      events: [],
      sources_succeeded: [],
      sources_failed: ["celebrate"],
    });
  });

  it("aborts provider body consumption and reports the source failed", async () => {
    const controller = new AbortController();
    let providerSignal: AbortSignal | undefined;
    let bodyController:
      | ReadableStreamDefaultController<Uint8Array>
      | undefined;
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      providerSignal = init?.signal ?? undefined;
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          bodyController = streamController;
        },
      });
      const abortBody = () =>
        bodyController?.error(
          new DOMException("Aborted", "AbortError"),
        );
      if (providerSignal?.aborted) abortBody();
      else providerSignal?.addEventListener("abort", abortBody, {
        once: true,
      });
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/calendar" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = getLiveEventsForSources(
      ["celebrate"],
      60,
      { signal: controller.signal },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    controller.abort();
    const result = await pending;

    expect(providerSignal?.aborted).toBe(true);
    expect(result).toMatchObject({
      events: [],
      sources_succeeded: [],
      sources_failed: ["celebrate"],
    });
  });

  it("does not let an abortable probe cancel an unrelated public cold fill", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00.000Z"));

    const requests: Array<{
      resolve: (response: Response) => void;
      reject: (reason: unknown) => void;
      signal?: AbortSignal;
    }> = [];
    const fetchMock = vi.fn<typeof fetch>((_input, init) =>
      new Promise<Response>((resolve, reject) => {
        const request = {
          resolve,
          reject,
          signal: init?.signal ?? undefined,
        };
        requests.push(request);
        const rejectAbort = () =>
          reject(new DOMException("Aborted", "AbortError"));
        if (request.signal?.aborted) rejectAbort();
        else request.signal?.addEventListener("abort", rejectAbort, {
          once: true,
        });
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const probeController = new AbortController();
    const probe = getLiveEventsForSources(
      ["celebrate"],
      60,
      { signal: probeController.signal },
    );
    const publicFill = getLiveEventsForSources(["celebrate"], 60);
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    probeController.abort();
    requests[1]?.resolve(
      new Response(ICAL, {
        status: 200,
        headers: { "content-type": "text/calendar" },
      }),
    );

    const [probeResult, publicResult] = await Promise.all([
      probe,
      publicFill,
    ]);

    expect(requests[0]?.signal?.aborted).toBe(true);
    expect(requests[1]?.signal?.aborted).toBe(false);
    expect(probeResult.sources_failed).toEqual(["celebrate"]);
    expect(publicResult.sources_succeeded).toEqual(["celebrate"]);
    expect(publicResult.events.map((event) => event.id)).toEqual([
      "inside-60",
    ]);
  });

  it("marks a paginated source failed when cancellation interrupts a later page", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      if (fetchMock.mock.calls.length === 1) {
        return Promise.resolve(
          new Response("[]", {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-wp-totalpages": "2",
            },
          }),
        );
      }
      return new Promise<Response>((_resolve, reject) => {
        const rejectAbort = () =>
          reject(new DOMException("Aborted", "AbortError"));
        if (init?.signal?.aborted) rejectAbort();
        else init?.signal?.addEventListener("abort", rejectAbort, {
          once: true,
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = getLiveEventsForSources(
      ["dfp"],
      60,
      { signal: controller.signal },
    );
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    controller.abort();

    await expect(pending).resolves.toMatchObject({
      events: [],
      sources_succeeded: [],
      sources_failed: ["dfp"],
    });
  });
});
