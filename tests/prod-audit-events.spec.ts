import { describe, expect, it } from "vitest";
import {
  classifyEventDetailResult,
  eventDetailGateSummary,
  eventDetailPathsFromHtml,
  hasEventDetailEvidence,
  isInternalEventDetailUrl,
  mapWithConcurrency,
} from "../scripts/lib/prod-audit-events.mjs";

const BASE = "https://frederickradius.app";

function result(
  status: number,
  body: string,
  contentType = "text/html; charset=utf-8",
  url = `${BASE}/events/alive-at-five-2026-08-06`,
) {
  return {
    status,
    body,
    url,
    headers: new Headers({ "content-type": contentType }),
  };
}

const EVENT_JSON_LD =
  '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Alive at Five"}</script>';
const RECOVERY_HTML =
  '<main data-event-recovery="source-unavailable">This event could not be confirmed yet. See all events.</main>';

describe("production event-link canary helpers", () => {
  it("extracts unique internal event anchors without scanning serialized inventory", () => {
    const html = `
      <a href="/events/alive-at-five-2026-08-06">Alive at Five</a>
      <script>self.__next_f.push(["/events/hidden-feed-row-2026-08-07"])</script>
      <a href="https://frederickradius.app/events/alive-at-five-2026-08-06">Duplicate</a>
      <a href="/events/calendar">Calendar</a>
      <a href="https://example.com/events/outside-event-2026-08-08">Outside</a>
      <a href="/events/ethics-commission-meeting-2026-08-11?from=today">Ethics</a>
    `;

    expect(eventDetailPathsFromHtml(html, BASE)).toEqual([
      "/events/alive-at-five-2026-08-06",
      "/events/ethics-commission-meeting-2026-08-11?from=today",
    ]);
  });

  it("never exceeds the requested request concurrency", async () => {
    let active = 0;
    let peak = 0;
    const output = await mapWithConcurrency(
      [1, 2, 3, 4, 5, 6, 7],
      3,
      async (value: number) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return value * 2;
      },
    );

    expect(peak).toBe(3);
    expect(output).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });

  it("accepts healthy detail and a successful Radius recovery response", () => {
    expect(
      classifyEventDetailResult(
        result(200, `Frederick Radius ${EVENT_JSON_LD}`),
        BASE,
      ),
    ).toEqual({ kind: "healthy" });
    expect(
      classifyEventDetailResult(
        result(200, `Frederick Radius. ${RECOVERY_HTML}`),
        BASE,
      ),
    ).toEqual({ kind: "recovery" });
  });

  it("requires an internal final event URL and event-specific structured data", () => {
    expect(
      isInternalEventDetailUrl(
        `${BASE}/events/alive-at-five-2026-08-06`,
        BASE,
      ),
    ).toBe(true);
    expect(isInternalEventDetailUrl(`${BASE}/events`, BASE)).toBe(false);
    expect(
      isInternalEventDetailUrl(
        "https://example.com/events/alive-at-five-2026-08-06",
        BASE,
      ),
    ).toBe(false);
    expect(hasEventDetailEvidence(EVENT_JSON_LD)).toBe(true);
    expect(
      hasEventDetailEvidence(
        '<script type="application/ld+json">{"@type":"ItemList"}</script>',
      ),
    ).toBe(false);

    expect(
      classifyEventDetailResult(
        result(200, `Frederick Radius ${EVENT_JSON_LD}`, "text/html", `${BASE}/events`),
        BASE,
      ),
    ).toEqual({ kind: "failure", reason: `left event detail: ${BASE}/events` });
    expect(
      classifyEventDetailResult(
        result(200, `Frederick Radius ${"generic page ".repeat(400)}`),
        BASE,
      ),
    ).toMatchObject({ kind: "failure" });
  });

  it.each([500, 501, 502, 503, 599])(
    "rejects branded recovery text on HTTP %i",
    (status) => {
      expect(
        classifyEventDetailResult(
          result(status, `Frederick Radius. ${RECOVERY_HTML}`),
          BASE,
        ),
      ).toEqual({ kind: "failure", reason: `server error: ${status}` });
    },
  );

  it("rejects recovery copy when the route does not return successful HTML", () => {
    expect(
      classifyEventDetailResult(
        result(404, `Frederick Radius. ${RECOVERY_HTML}`),
        BASE,
      ),
    ).toEqual({
      kind: "failure",
      reason:
        "recovery state violated route contract: 404, text/html; charset=utf-8",
    });
    expect(
      classifyEventDetailResult(
        result(
          200,
          `Frederick Radius. ${RECOVERY_HTML}`,
          "application/json",
        ),
        BASE,
      ),
    ).toEqual({
      kind: "failure",
      reason: "recovery state violated route contract: 200, application/json",
    });
  });

  it("rejects generic errors and missing event pages", () => {
    expect(
      classifyEventDetailResult(result(500, "Application error"), BASE),
    ).toEqual({ kind: "failure", reason: "server error: 500" });
    expect(
      classifyEventDetailResult(result(404, "Event missing"), BASE),
    ).toMatchObject({ kind: "failure" });
  });

  it("requires real event content and caps controlled recovery responses", () => {
    expect(
      eventDetailGateSummary([
        { kind: "recovery" },
        { kind: "recovery" },
        { kind: "recovery" },
        { kind: "recovery" },
      ]),
    ).toMatchObject({ healthy: 0, recovery: 4, allowedRecoveries: 1, passes: false });

    expect(
      eventDetailGateSummary([
        { kind: "healthy" },
        { kind: "healthy" },
        { kind: "healthy" },
        { kind: "recovery" },
      ]),
    ).toMatchObject({ healthy: 3, recovery: 1, allowedRecoveries: 1, passes: true });

    expect(
      eventDetailGateSummary([
        { kind: "healthy" },
        { kind: "recovery" },
        { kind: "failure" },
        { kind: "healthy" },
      ]),
    ).toMatchObject({ failure: 1, passes: false });
  });
});
