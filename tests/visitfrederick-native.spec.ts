import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchVisitFrederickNativeFeed,
} from "@/lib/integrations/visitfrederick";
import { VISIT_FREDERICK_FEED_URL } from "@/lib/integrations/visitfrederick-snapshot";

const VALID_RSS =
  '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel></channel></rss>';

function publisherResponse(
  body: BodyInit | null,
  init: ResponseInit = {},
  finalUrl = VISIT_FREDERICK_FEED_URL,
): Response {
  const response = new Response(body, {
    status: 200,
    headers: { "content-type": "application/rss+xml; charset=UTF-8" },
    ...init,
  });
  Object.defineProperty(response, "url", {
    configurable: true,
    value: finalUrl,
  });
  return response;
}

describe("Visit Frederick native background read", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts a bounded RSS response from only the reviewed final URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(publisherResponse(VALID_RSS));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchVisitFrederickNativeFeed()).resolves.toEqual({
      state: "ok",
      xml: VALID_RSS,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      VISIT_FREDERICK_FEED_URL,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        cache: "no-store",
        redirect: "manual",
        headers: {
          "User-Agent": "FrederickRadius/1.0 (+https://frederickradius.app)",
        },
      }),
    );
  });

  it.each([403, 408, 429, 500, 503])(
    "classifies HTTP %s as recoverable for scheduled fallback",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          publisherResponse("", { status }),
        ),
      );

      await expect(fetchVisitFrederickNativeFeed()).resolves.toEqual({
        state: "recoverable",
        reason: `HTTP ${status}`,
      });
    },
  );

  it.each([404, 410])(
    "classifies HTTP %s as a terminal not-found response",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          publisherResponse("", { status }),
        ),
      );

      await expect(fetchVisitFrederickNativeFeed()).resolves.toEqual({
        state: "not-found",
        reason: `HTTP ${status}`,
      });
    },
  );

  it.each([400, 401, 422])(
    "classifies HTTP %s as rejected and ineligible for paid recovery",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          publisherResponse("", { status }),
        ),
      );

      await expect(fetchVisitFrederickNativeFeed()).resolves.toEqual({
        state: "rejected",
        reason: `HTTP ${status}`,
      });
    },
  );

  it("rejects redirects away from the exact reviewed publisher feed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      publisherResponse("", {
        status: 302,
        headers: {
          location: "https://www.visitfrederick.org/events/",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchVisitFrederickNativeFeed()).resolves.toEqual({
      state: "rejected",
      reason: "the publisher redirect was not followed",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      redirect: "manual",
    });
  });

  it("rejects a successful response attributed to any other final URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        publisherResponse(
          VALID_RSS,
          {},
          "https://www.visitfrederick.org/events/",
        ),
      ),
    );

    await expect(fetchVisitFrederickNativeFeed()).resolves.toEqual({
      state: "rejected",
      reason:
        "the publisher response did not remain on the reviewed feed URL",
    });
  });

  it.each([
    ["wrong media type", VALID_RSS, { "content-type": "text/html" }],
    ["malformed body", "<html>not RSS</html>", { "content-type": "application/rss+xml" }],
    [
      "oversized declared body",
      VALID_RSS,
      {
        "content-type": "application/rss+xml",
        "content-length": String(512 * 1_024 + 1),
      },
    ],
  ])(
    "classifies a %s as recoverable without accepting its contents",
    async (_label, body, headers) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          publisherResponse(body, { headers }),
        ),
      );

      await expect(fetchVisitFrederickNativeFeed()).resolves.toEqual({
        state: "recoverable",
        reason: "the publisher returned an invalid RSS response",
      });
    },
  );

  it("bounds streamed bytes even when Content-Length understates the body", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(512 * 1_024));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        publisherResponse(stream, {
          headers: {
            "content-type": "application/rss+xml",
            "content-length": "1",
          },
        }),
      ),
    );

    await expect(fetchVisitFrederickNativeFeed()).resolves.toEqual({
      state: "recoverable",
      reason: "the publisher returned an invalid RSS response",
    });
  });

  it("classifies an actual deadline abort as recoverable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );

    const pending = fetchVisitFrederickNativeFeed();
    await vi.advanceTimersByTimeAsync(2_500);

    await expect(pending).resolves.toEqual({
      state: "recoverable",
      reason: "timed out after 2500ms",
    });
  });

  it("classifies a network failure as recoverable without leaking details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("secret upstream hostname failed")),
    );

    await expect(fetchVisitFrederickNativeFeed()).resolves.toEqual({
      state: "recoverable",
      reason: "the publisher could not be reached",
    });
  });
});
