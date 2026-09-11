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
type EventsHydrationProof = {
  personalizedBeforeReady: boolean;
  visibleSummaries: string[];
  done: boolean;
};

// CI deliberately builds and starts the app without repository secrets. In
// that environment, event rows that exist only in the durable archive must
// render the honest recovery state. The live post-deploy canary still enforces
// the 25% recovery ceiling against production, where the archive is present.
const HAS_DURABLE_EVENT_ARCHIVE = Boolean(
  process.env.DATABASE_URL || process.env.DIRECT_URL,
);

async function visibleEventLinks(page: Page): Promise<string[]> {
  return page
    .locator('a[href^="/events/"]')
    .evaluateAll((anchors) =>
      anchors
        .filter((anchor) => anchor.getClientRects().length > 0)
        .map((anchor) => anchor.getAttribute("href") ?? ""),
    );
}

test("a returning Events view restores its scope before default results can paint", async ({
  page,
  context,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const appOrigin = new URL(baseURL ?? "http://localhost:3010");
  await context.addCookies([
    {
      name: "fr_onboarded",
      value: "1",
      domain: appOrigin.hostname,
      path: "/",
    },
  ]);

  // Keep the server unaware of this client-only returning-user state. That
  // deliberately makes its static event preview countywide, reproducing the
  // exact hydration boundary where the wrong hero used to flash.
  await page.addInitScript(() => {
    window.localStorage.setItem("fr:scope:v1", "town:brunswick");
    window.localStorage.setItem("fr:events-town:v1", "brunswick");

    const proof: EventsHydrationProof = {
      personalizedBeforeReady: false,
      visibleSummaries: [],
      done: false,
    };
    (window as typeof window & { __eventsHydrationProof?: EventsHydrationProof })
      .__eventsHydrationProof = proof;
    let sampled = 0;
    let readyFrames = 0;

    const samplePaint = () => {
      sampled += 1;
      const root = document.querySelector<HTMLElement>(
        "[data-events-interaction-ready]",
      );
      const personalized = document.querySelector<HTMLElement>(
        "[data-events-personalized-view]",
      );
      if (root && personalized) {
        const ready =
          root.getAttribute("data-events-interaction-ready") === "true";
        const personalizedVisible =
          !personalized.hidden &&
          getComputedStyle(personalized).display !== "none" &&
          personalized.getClientRects().length > 0;
        if (personalizedVisible) {
          if (!ready) proof.personalizedBeforeReady = true;
          proof.visibleSummaries.push(
            personalized
              .querySelector<HTMLElement>(".eb-filter-summary")
              ?.textContent?.trim() ?? "",
          );
        }
        if (ready) readyFrames += 1;
      }

      if (sampled < 240 && readyFrames < 4) {
        window.requestAnimationFrame(samplePaint);
      } else {
        proof.done = true;
      }
    };
    window.requestAnimationFrame(samplePaint);
  });

  const response = await page.goto("/events?lens=weekend&free=1", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);

  const board = page.locator("[data-events-interaction-ready]");
  await expect(board).toHaveAttribute("data-events-interaction-ready", "true", {
    timeout: 30_000,
  });
  const personalized = page.locator("[data-events-personalized-view]");
  await expect(personalized).toBeVisible();
  await expect(personalized.locator(".eb-filter-summary")).toContainText(
    "Free · This weekend · Brunswick",
  );

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & {
            __eventsHydrationProof?: EventsHydrationProof;
          }).__eventsHydrationProof?.done ?? false,
      ),
    )
    .toBe(true);
  const proof = await page.evaluate(
    () =>
      (window as typeof window & {
        __eventsHydrationProof?: EventsHydrationProof;
      }).__eventsHydrationProof,
  );
  expect(proof, "the pre-hydration paint observer should run").toBeDefined();

  expect(
    proof!.personalizedBeforeReady,
    "no default countywide result or hero may paint before browser state is restored",
  ).toBe(false);

  expect(proof!.visibleSummaries.length).toBeGreaterThan(0);
  expect(
    proof!.visibleSummaries.every(
      (summary) =>
        summary.includes("Free") &&
        summary.includes("This weekend") &&
        summary.includes("Brunswick"),
    ),
    "the first and every later personalized paint should carry the restored view",
  ).toBe(true);
  expect(
    proof!.visibleSummaries.includes("Everything · Anytime · Whole county"),
  ).toBe(false);
});

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
  if (HAS_DURABLE_EVENT_ARCHIVE) {
    expect(
      gate.recovery,
      `Recovery responses must stay within the release budget (${gate.allowedRecoveries}/${gate.total}).`,
    ).toBeLessThanOrEqual(gate.allowedRecoveries);
  }
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

test("a mobile event detail keeps one reachable save action and a usable image credit", async ({
  page,
  context,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const appOrigin = new URL(baseURL ?? "http://localhost:3010");
  await context.addCookies([
    {
      name: "fr_onboarded",
      value: "1",
      domain: appOrigin.hostname,
      path: "/",
    },
  ]);

  await page.goto("/events", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-events-interaction-ready]")).toHaveAttribute(
    "data-events-interaction-ready",
    "true",
    { timeout: 30_000 },
  );
  const hrefs = await visibleEventLinks(page);
  const eventPaths = hrefs
    .map((href) => new URL(href, appOrigin).pathname)
    .filter((path) => EVENT_DETAIL_PATH.test(path) && path !== "/events/calendar");
  let eventPath: string | undefined;
  for (const candidate of [...new Set(eventPaths)].slice(0, 16)) {
    const candidateResponse = await page.request.get(candidate, {
      failOnStatusCode: false,
      timeout: 30_000,
    });
    const state = classifyEventDetailResult(
      {
        status: candidateResponse.status(),
        body: await candidateResponse.text(),
        url: candidateResponse.url(),
        headers: new Headers(candidateResponse.headers()),
      },
      appOrigin,
    ) as EventDetailState;
    if (state.kind === "healthy") {
      eventPath = candidate;
      break;
    }
  }
  expect(eventPath, "Events should expose a current detail page").toBeTruthy();

  const response = await page.goto(eventPath!, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator('button[data-save-ref^="event:"]:visible')).toHaveCount(1);

  const creditLink = page.locator("[data-event-photo-credit] a:visible");
  if (await creditLink.count()) {
    await expect(creditLink.first()).toHaveClass(/\btap-44\b/);
  }
});

test("a source-checked event keeps its official page reachable beside transactional actions", async ({
  page,
  context,
  baseURL,
}) => {
  const appOrigin = new URL(baseURL ?? "http://localhost:3010");
  await context.addCookies([
    {
      name: "fr_onboarded",
      value: "1",
      domain: appOrigin.hostname,
      path: "/",
    },
  ]);

  const response = await page.goto("/events/snallyfest-2026-kickoff", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);

  const source = page.locator("[data-event-source-link]");
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute("href", "https://snallyfest.com/");
  await expect(source).toHaveAttribute("target", "_blank");
  await expect(source).toContainText("Official event page");
});
