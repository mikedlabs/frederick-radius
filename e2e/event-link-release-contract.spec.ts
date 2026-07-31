import { expect, test, type Page } from "@playwright/test";
import { findErrorBoundaryMarker } from "./error-boundary-markers";
import {
  classifyEventDetailResult,
  eventDetailGateSummary,
} from "../scripts/lib/prod-audit-events.mjs";

const SURFACES = ["/today", "/events"] as const;
const EVENT_DETAIL_PATH = /^\/events\/[^/?#]+$/;
type EventDetailState = {
  kind: "healthy" | "recovery" | "failure";
  reason?: string;
};

async function visibleEventLinks(page: Page): Promise<string[]> {
  return page
    .locator('a[href^="/events/"]')
    .evaluateAll((anchors) =>
      anchors
        .filter((anchor) => anchor.getClientRects().length > 0)
        .map((anchor) => anchor.getAttribute("href") ?? ""),
    );
}

/**
 * Release contract for the event-detail incident class: if Today or Events
 * publishes an event link, the same production build must be able to open it.
 *
 * This intentionally discovers links from the rendered surfaces instead of
 * maintaining a second fixture list that can drift away from what users see.
 * Only displayed anchors are followed, so closed civic drawers do not turn a
 * focused release gate into a crawl of the entire archive. The event board is
 * awaited first, keeping the check deterministic under its streaming shell.
 */
test("every event link published by Today and Events opens without a generic server failure", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(180_000);

  const appOrigin = new URL(baseURL ?? "http://localhost:3010");
  await context.addCookies([
    {
      name: "fr_onboarded",
      value: "1",
      domain: appOrigin.hostname,
      path: "/",
    },
  ]);

  const links = new Set<string>();
  for (const surface of SURFACES) {
    const response = await page.goto(surface, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    expect(response?.status(), `${surface} should publish from a healthy page`).toBe(200);

    if (surface === "/events") {
      await expect(page.locator("[data-events-interaction-ready]")).toHaveAttribute(
        "data-events-interaction-ready",
        "true",
        { timeout: 30_000 },
      );
    }
    await expect(page.locator("main h1")).toHaveCount(1, {
      timeout: 30_000,
    });

    for (const href of await visibleEventLinks(page)) {
      const path = new URL(href, appOrigin).pathname;
      if (EVENT_DETAIL_PATH.test(path) && path !== "/events/calendar") {
        links.add(path);
      }
    }
  }

  expect(
    links.size,
    "Today and Events should expose at least one checkable event detail link",
  ).toBeGreaterThan(0);

  const failures: string[] = [];
  const states: EventDetailState[] = [];
  // A small batch keeps the local production server responsive while still
  // checking every displayed link from both discovery surfaces.
  const paths = [...links].sort();
  for (let index = 0; index < paths.length; index += 4) {
    const batch = paths.slice(index, index + 4);
    const results = await Promise.all(
      batch.map(async (path) => {
        try {
          const response = await page.request.get(path, {
            failOnStatusCode: false,
            timeout: 45_000,
          });
          return {
            path,
            status: response.status(),
            body: await response.text(),
            url: response.url(),
            headers: new Headers(response.headers()),
          };
        } catch (error) {
          return {
            path,
            status: 0,
            body: error instanceof Error ? error.message : String(error),
            url: "",
            headers: new Headers(),
          };
        }
      }),
    );

    for (const result of results) {
      const marker = findErrorBoundaryMarker(result.body);
      const state: EventDetailState = marker
        ? { kind: "failure", reason: `error boundary: ${marker}` }
        : (classifyEventDetailResult(result, appOrigin) as EventDetailState);
      states.push(state);
      if (state.kind === "failure") {
        failures.push(
          `${result.path}: ${result.status || "request failed"} (${state.reason ?? "failed event contract"})`,
        );
      }
    }
  }

  const gate = eventDetailGateSummary(states);

  expect(
    failures,
    `Published event links must resolve in this build:\n${failures.join("\n")}`,
  ).toEqual([]);
  expect(
    gate.healthy,
    "At least one published event must render real event-detail content.",
  ).toBeGreaterThan(0);
  expect(
    gate.recovery,
    `Recovery responses must stay within the release budget (${gate.allowedRecoveries}/${gate.total}).`,
  ).toBeLessThanOrEqual(gate.allowedRecoveries);
});

test("an impossible event slug keeps an honest event-scoped 404", async ({
  request,
}) => {
  const response = await request.get("/events/NOT_A_REAL_EVENT", {
    failOnStatusCode: false,
    timeout: 30_000,
  });
  const body = await response.text();

  expect(response.status()).toBe(404);
  expect(body).toContain("Off the calendar");
  expect(findErrorBoundaryMarker(body)).toBeNull();
});
