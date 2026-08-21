import { expect, test, type Page, type Route } from "@playwright/test";
import type { AskResult, AskSource } from "../src/lib/ask/contracts";

function answer(overrides: Partial<AskResult> = {}): AskResult {
  return {
    status: "matches",
    configured: true,
    usedModel: false,
    answer: "Radius found a useful answer.",
    sources: [],
    ...overrides,
  };
}

function source(index: number): AskSource {
  return {
    slug: `source-${index}`,
    name: `Source ${index}`,
    category: "guide",
    href: index === 1 ? "/about" : `/places/source-${index}`,
    reason: `Reason for source ${index}.`,
    city: "Frederick",
  };
}

async function fulfill(route: Route, result: AskResult, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(result),
  });
}

async function submit(page: Page, query: string) {
  await expect(
    page.locator('[data-ask-interaction-ready="true"]'),
  ).toBeVisible();
  const input = page.getByRole("textbox", { name: "Ask Radius" });
  await input.fill(query);
  await input.press("Enter");
}

test.describe("Ask Radius deterministic workspace", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows every starter question without clipping and keeps mobile controls clear", async ({
    page,
  }) => {
    await page.goto("/ask", { waitUntil: "domcontentloaded" });

    const starters = page.locator("[data-ask-empty-state]");
    const questions = starters.getByRole("button");
    await expect(questions).toHaveCount(3);
    const navBox = await page.getByRole("navigation", { name: "Primary" }).boundingBox();
    expect(navBox, "expected the fixed bottom navigation to have a layout box").not.toBeNull();

    for (const question of await questions.all()) {
      await expect(question).toBeVisible();
      const box = await question.boundingBox();
      expect(box, "expected each starter question to have a layout box").not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      expect(box!.y + box!.height).toBeLessThanOrEqual(navBox!.y);
    }

    const area = page.getByRole("button", { name: /Search area:/ });
    const areaBox = await area.boundingBox();
    expect(areaBox, "expected the area control to have a layout box").not.toBeNull();
    expect(areaBox!.width).toBeGreaterThanOrEqual(44);
    expect(areaBox!.height).toBeGreaterThanOrEqual(44);

    await page.setViewportSize({ width: 320, height: 568 });
    const narrowNavBox = await page
      .getByRole("navigation", { name: "Primary" })
      .boundingBox();
    expect(narrowNavBox, "expected the narrow-screen navigation to have a layout box").not.toBeNull();
    const finalQuestionBox = await questions.last().boundingBox();
    expect(finalQuestionBox, "expected the final question to stay visible on a narrow phone").not.toBeNull();
    expect(finalQuestionBox!.x + finalQuestionBox!.width).toBeLessThanOrEqual(320);
    expect(finalQuestionBox!.y + finalQuestionBox!.height).toBeLessThanOrEqual(
      narrowNavBox!.y,
    );
  });

  test("renders zero, one, and expandable source states", async ({ page }) => {
    await page.route("**/api/ask", async (route) => {
      const { query } = route.request().postDataJSON() as { query: string };
      const count = query.startsWith("three") ? 3 : query.startsWith("zero") ? 0 : 1;
      await fulfill(
        route,
        answer({
          answer: `${count} source answer.`,
          sources: Array.from({ length: count }, (_, index) => source(index + 1)),
        }),
      );
    });

    await page.goto("/ask");
    await submit(page, "one source");
    await expect(page.getByText("1 source answer.")).toBeVisible();
    await expect(
      page.locator('[data-ask-composer-dock="sticky"]'),
    ).toBeVisible();
    await expect(page.getByText("Source 1", { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Featured Radius tools" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Browse tools" })).toBeVisible();

    await submit(page, "three sources");
    await expect(page.getByText("3 source answer.")).toBeVisible();
    await expect(page.getByText("Source 3", { exact: true })).toHaveCount(0);
    await page.locator("summary").filter({ hasText: "Sources behind this answer" }).click();
    await expect(page.getByText("Source 2", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Show all 2 sources" }).click();
    await expect(page.getByText("Source 3", { exact: true })).toBeVisible();

    await submit(page, "zero sources");
    await expect(page.getByText("0 source answer.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sources behind this answer" })).toHaveCount(0);
  });

  test("flags a bad answer without sending the question or answer text", async ({
    page,
  }) => {
    const privateQuestion = "What is worth doing tonight?";
    const privateAnswer = "Alive at Five is the strongest current match.";
    let feedbackBody: Record<string, unknown> | null = null;

    await page.route("**/api/ask", (route) =>
      fulfill(
        route,
        answer({
          answer: privateAnswer,
          sources: [
            {
              slug: "alive-at-five",
              name: "Alive at Five",
              category: "event",
              href: "/events/alive-at-five?from=ask",
              reason: "It starts soon.",
              city: "Frederick",
              isPrimaryRankedResult: true,
            },
          ],
        }),
      ),
    );
    await page.route("**/api/feedback", async (route) => {
      feedbackBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/ask");
    await submit(page, privateQuestion);
    await page.getByRole("button", { name: "Not right" }).click();
    await expect(page.getByText("What was off?", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Too far away" }).click();

    await expect(
      page.getByText("Thanks. We will use that to improve Radius."),
    ).toBeVisible();
    await expect.poll(() => feedbackBody?.reason).toBe("too_far");
    expect(feedbackBody).toEqual({
      source: "ask-correction",
      reason: "too_far",
      resultRef: "/events/alive-at-five",
      pathname: "/ask",
    });
    const serialized = JSON.stringify(feedbackBody);
    expect(serialized).not.toContain(privateQuestion);
    expect(serialized).not.toContain(privateAnswer);
  });

  test("keeps a source photo square on a 390px result card", async ({ page }) => {
    await page.route("**/api/ask", (route) =>
      fulfill(
        route,
        answer({
          answer: "Gravel & Grind covers both parts of the request.",
          sources: [
            {
              ...source(1),
              slug: "gravel-and-grind-frederick",
              name: "Gravel & Grind",
              category: "coffee",
              href: "/places/gravel-and-grind-frederick",
              reason: "Matches the full request",
              detail:
                "This East 6th Street coffee bar and bike shop serves pour-overs up front and sells gravel and road bikes in back.",
              photo_url: "/history-photos/carroll-creek-park.jpg",
              rating: 4.8,
              ratingCount: 394,
              status: "Hours not posted",
              phone: "301-555-0100",
            },
          ],
        }),
      ),
    );

    await page.goto("/ask");
    await submit(page, "coffee and bikes downtown");

    const answerHeading = page.locator("#ask-answer-heading");
    await expect(answerHeading).toBeFocused();
    await expect
      .poll(() =>
        answerHeading.evaluate((element) =>
          window.getComputedStyle(element).outlineStyle,
        ),
      )
      .toBe("none");

    const card = page.locator('[data-ask-source-index="0"]');
    const media = card.locator("[data-ask-source-media]");
    await expect(card.getByRole("link", { name: "Gravel & Grind", exact: true })).toBeVisible();
    await expect(media).toBeVisible();

    const geometry = await media.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
      };
    });
    expect(geometry.viewportWidth).toBe(390);
    expect(geometry.width).toBeGreaterThanOrEqual(67);
    expect(geometry.width).toBeLessThanOrEqual(69);
    expect(Math.abs(geometry.width - geometry.height)).toBeLessThanOrEqual(1);

    const cardBox = await card.boundingBox();
    expect(cardBox, "expected the source card to have a layout box").not.toBeNull();
    expect(cardBox!.height).toBeGreaterThan(geometry.height + 44);
  });

  test("renders an editable plan from a mocked response", async ({ page }) => {
    await page.route("**/api/ask", (route) =>
      fulfill(
        route,
        answer({
          answer: "Here is a simple two-stop plan.",
          presentation: {
            layout: "plan",
            summary: "Here is a simple two-stop plan.",
            detail: null,
          },
          plan: {
            title: "Downtown date night",
            summary: "Dinner followed by a show.",
            dateLabel: "Today",
            href: "/plan?occasion=date-night",
            stops: [
              {
                order: 1,
                time: "6:00 PM",
                name: "Dinner stop",
                category: "restaurant",
                href: "/places/dinner-stop",
                why: "It is close to the theater.",
                status: "Check current hours.",
              },
              {
                order: 2,
                time: "7:30 PM",
                name: "Evening show",
                category: "event",
                href: "/events/evening-show",
                why: "It starts after dinner.",
                status: "Tickets may be required.",
              },
            ],
          },
        }),
      ),
    );

    await page.goto("/ask");
    await submit(page, "Plan a date night");
    await expect(page.getByText("A route you can edit")).toBeVisible();
    await expect(page.getByTestId("ask-plan-stops").locator(":scope > li")).toHaveCount(2);
    await expect(page.getByRole("link", { name: /Open and edit this route/ })).toHaveAttribute(
      "href",
      "/plan?occasion=date-night",
    );
  });

  for (const failure of ["empty", "rate-limit", "service", "network"] as const) {
    test(`renders an actionable ${failure} state`, async ({ page }) => {
      await page.route("**/api/ask", async (route) => {
        if (failure === "network") {
          await route.abort("failed");
          return;
        }
        if (failure === "rate-limit") {
          await route.fulfill({
            status: 429,
            contentType: "application/json",
            body: JSON.stringify({ message: "Too many questions. Give it a moment." }),
          });
          return;
        }
        if (failure === "service") {
          await route.fulfill({ status: 500, body: "service unavailable" });
          return;
        }
        await fulfill(
          route,
          answer({
            status: "empty",
            answer: "Radius could not verify a useful match.",
          }),
        );
      });

      await page.goto("/ask");
      await submit(page, `${failure} example`);
      if (failure === "empty") {
        await expect(page.getByRole("heading", { name: "Radius could not find a solid match." })).toBeVisible();
      } else {
        await expect(page.getByRole("heading", { name: "Radius could not complete that request." })).toBeVisible();
      }
      await expect(page.getByText(/Radius could not|Too many questions/).last()).toBeVisible();
    });
  }

  test("keeps a visible progress state while a response is slow", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/ask", async (route) => {
      await gate;
      await fulfill(route, answer({ answer: "The delayed answer arrived." }));
    });

    await page.goto("/ask");
    await submit(page, "slow response");
    const composer = page.getByRole("textbox", { name: "Ask Radius" });
    await expect(composer).toHaveAttribute("readonly", "");
    await expect(page.getByRole("button", { name: "Cancel" })).toContainText(
      "Stop",
    );
    await expect(
      page.getByText("Radius is checking current local data and sources."),
    ).toBeVisible();
    await page.waitForTimeout(1_400);
    await expect(
      page.getByText("Radius is checking current local data and sources."),
    ).toBeVisible();
    release();
    await expect(page.getByText("The delayed answer arrived.")).toBeVisible();
    await expect(composer).not.toHaveAttribute("readonly");
  });

  test("lets the user cancel a slow request and retry it", async ({ page }) => {
    let calls = 0;
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    await page.route("**/api/ask", async (route) => {
      calls += 1;
      if (calls === 1) {
        await firstGate;
        await fulfill(route, answer({ answer: "Canceled response." })).catch(() => {});
        return;
      }
      await fulfill(route, answer({ answer: "The retry worked." }));
    });

    await page.goto("/ask");
    await submit(page, "cancel this request");
    await expect.poll(() => calls).toBe(1);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByText(
        "That request was canceled, and your question is still here if you want to try again.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Try again", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByText("The retry worked.")).toBeVisible();
    await expect.poll(() => calls).toBe(2);
    releaseFirst();
  });

  test("keeps a canceled response from replacing the next answer", async ({ page }) => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    await page.route("**/api/ask", async (route) => {
      const { query } = route.request().postDataJSON() as { query: string };
      if (query === "first request") {
        await firstGate;
        await fulfill(route, answer({ answer: "Stale first answer." })).catch(() => {});
        return;
      }
      await fulfill(route, answer({ answer: "Current second answer." }));
    });

    await page.goto("/ask");
    await submit(page, "first request");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByText(
        "That request was canceled, and your question is still here if you want to try again.",
      ),
    ).toBeVisible();
    await page.getByRole("textbox", { name: "Ask Radius" }).fill("second request");
    await page.getByRole("textbox", { name: "Ask Radius" }).press("Enter");
    await expect(page.getByText("Current second answer.")).toBeVisible();
    releaseFirst();
    await page.waitForTimeout(150);
    await expect(page.getByText("Stale first answer.")).toHaveCount(0);
  });

  test("reuses the bounded client cache for the same question", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/ask", async (route) => {
      calls += 1;
      await fulfill(route, answer({ answer: "Cached answer." }));
    });

    await page.goto("/ask");
    await submit(page, "same question");
    await expect(page.getByText("Cached answer.")).toBeVisible();
    await submit(page, "same question");
    await expect.poll(() => calls).toBe(1);
  });

  test("moves focus to the area chooser and sends the selected town", async ({ page }) => {
    let requestBody: { query?: string; scope?: string } = {};
    await page.route("**/api/ask", async (route) => {
      requestBody = route.request().postDataJSON() as typeof requestBody;
      await fulfill(route, answer({ answer: "Urbana coffee answer." }));
    });

    await page.goto("/ask");
    await submit(page, "Where can I get coffee near me?");
    const chooser = page.locator("#ask-area-chooser");
    await expect(chooser).toBeFocused();
    await chooser.press("Escape");
    const areaTrigger = page.getByRole("button", { name: /Search area:/ });
    await expect(areaTrigger).toBeFocused();
    await areaTrigger.click();
    await expect(chooser).toBeFocused();
    await page.getByLabel("Choose a town").selectOption("urbana");
    await expect(page.getByText("Urbana coffee answer.")).toBeVisible();
    expect(requestBody.scope).toBe("town:urbana");
  });

  test("keeps the answered composer compact while its area chooser opens below it", async ({
    page,
  }) => {
    await page.route("**/api/ask", (route) =>
      fulfill(
        route,
        answer({
          answer: Array.from(
            { length: 90 },
            () => "This answer has useful local detail.",
          ).join(" "),
        }),
      ),
    );

    await page.goto("/ask");
    await submit(page, "What is happening tonight?");
    await expect(page.getByText("More context", { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const dock = page.locator('[data-ask-composer-dock="sticky"]');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const readingPosition = await page.evaluate(() => window.scrollY);
    expect(readingPosition).toBeGreaterThan(100);
    await dock.getByRole("button", { name: /Search area:/ }).click();
    await expect(page.locator("#ask-area-chooser")).toBeVisible();
    await expect(dock.locator("#ask-area-chooser")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Search area" })).toBeVisible();
    await expect
      .poll(async () =>
        Math.abs((await page.evaluate(() => window.scrollY)) - readingPosition),
      )
      .toBeLessThanOrEqual(2);
  });

  test("asks a first-time visitor for an area before the dinner shortcut runs", async ({
    page,
  }) => {
    let calls = 0;
    await page.route("**/api/ask", async (route) => {
      calls += 1;
      await fulfill(route, answer({ answer: "Dinner answer." }));
    });

    await page.goto("/ask");
    await page.getByRole("button", { name: "Dinner tonight" }).click();
    await expect(page.locator("#ask-area-chooser")).toBeVisible();
    expect(calls).toBe(0);
    await page.getByLabel("Choose a town").selectOption("frederick");
    await expect(page.getByText("Dinner answer.")).toBeVisible();
    expect(calls).toBe(1);
  });

  test("does not treat a saved home as the user's current location", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("fr:home-muni:v1", "frederick");
    });
    let calls = 0;
    await page.route("**/api/ask", async (route) => {
      calls += 1;
      await fulfill(route, answer({ answer: "Nearest answer." }));
    });

    await page.goto("/ask");
    await expect(
      page.getByRole("button", {
        name: "Search area: Ranked from Frederick City. Change area.",
      }),
    ).toBeVisible();
    await submit(page, "Where is the closest restroom near me?");
    await expect(page.locator("#ask-area-chooser")).toBeVisible();
    expect(calls).toBe(0);
  });

  for (const shortcut of [
    {
      label: "Dinner tonight",
      query: "Where should I eat tonight?",
    },
    {
      label: "What is on tonight?",
      query: "What is worth doing tonight?",
    },
  ]) {
    test(`${shortcut.label} uses home as a ranking fallback without hard-filtering it`, async ({ page }) => {
      await page.addInitScript(() => {
        window.localStorage.setItem("fr:home-muni:v1", "frederick");
      });
      let requestBody: { query?: string; scope?: string } = {};
      await page.route("**/api/ask", async (route) => {
        requestBody = route.request().postDataJSON() as typeof requestBody;
        await fulfill(route, answer({ answer: "Scoped shortcut answer." }));
      });

      await page.goto("/ask");
      await expect(
        page.getByRole("button", {
          name: "Search area: Ranked from Frederick City. Change area.",
        }),
      ).toBeVisible();
      await page.getByRole("button", { name: shortcut.label }).click();
      await expect(page.getByText("Scoped shortcut answer.")).toBeVisible();

      expect(requestBody.query).toBe(shortcut.query);
      expect(requestBody).not.toHaveProperty("scope");
    });
  }

  test("hydrates a saved home area without changing the server-rendered tree", async ({
    page,
  }) => {
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /hydration failed|server rendered text didn't match/i.test(message.text())
      ) {
        hydrationErrors.push(message.text());
      }
    });
    await page.addInitScript(() => {
      window.localStorage.setItem("fr:home-muni:v1", "frederick");
    });

    await page.goto("/ask");
    await expect(
      page.getByRole("button", {
        name: "Search area: Ranked from Frederick City. Change area.",
      }),
    ).toBeVisible();
    expect(hydrationErrors).toEqual([]);
  });

  test("uses the saved home fallback for an initial local question link", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("fr:home-muni:v1", "frederick");
    });
    let requestBody: { query?: string; scope?: string } = {};
    await page.route("**/api/ask", async (route) => {
      requestBody = route.request().postDataJSON() as typeof requestBody;
      await fulfill(route, answer({ answer: "Home-ranked coffee answer." }));
    });

    await page.goto("/ask?q=coffee");
    await expect(page.getByText("Home-ranked coffee answer.")).toBeVisible();
    await expect(page.locator("#ask-area-chooser")).toHaveCount(0);
    expect(requestBody.query).toBe("coffee");
    expect(requestBody).not.toHaveProperty("scope");
    await page.getByRole("button", { name: /Search area:/ }).click();
    await page
      .getByRole("dialog", { name: "Search area" })
      .getByRole("button", { name: "Whole county" })
      .click();
    await expect(page.getByText("Update it for Whole county.")).toBeVisible();
  });

  test("passive location hydration preserves a town-scoped question link", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("fr:scope:v1", "town:urbana");
      window.sessionStorage.setItem(
        "fr_geo_v1",
        JSON.stringify({
          lng: -77.4105,
          lat: 39.4143,
          accuracy: 18,
          timestamp: Date.now(),
        }),
      );
    });
    let requestBody: { query?: string; scope?: string } = {};
    await page.route("**/api/ask", async (route) => {
      requestBody = route.request().postDataJSON() as typeof requestBody;
      await fulfill(route, answer({ answer: "Urbana-scoped coffee answer." }));
    });

    await page.goto("/ask?q=coffee");
    await expect(page.getByText("Urbana-scoped coffee answer.")).toBeVisible();
    expect(requestBody.scope).toBe("town:urbana");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("fr:scope:v1")))
      .toBe("town:urbana");
  });

  test("lets a fresh device fix outrank the saved home town", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("fr:home-muni:v1", "brunswick");
      window.sessionStorage.setItem(
        "fr_geo_v1",
        JSON.stringify({
          lng: -77.4105,
          lat: 39.4143,
          accuracy: 18,
          timestamp: Date.now(),
        }),
      );
    });
    let requestBody: {
      query?: string;
      scope?: string;
      lat?: number;
      lng?: number;
    } = {};
    await page.route("**/api/ask", async (route) => {
      requestBody = route.request().postDataJSON() as typeof requestBody;
      await fulfill(route, answer({ answer: "Downtown-first answer." }));
    });

    await page.goto("/ask");
    await expect(
      page.getByRole("button", {
        name: "Search area: Near your location. Change area.",
      }),
    ).toBeVisible();
    await submit(page, "Where should I eat tonight?");
    await expect(page.getByText("Downtown-first answer.")).toBeVisible();
    expect(requestBody).toMatchObject({
      scope: "nearme",
      lat: 39.4143,
      lng: -77.4105,
    });
  });

  test("keeps the latest self-contained question through share, refresh, and Back", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: ShareData) => {
          (window as Window & { __askShared?: ShareData }).__askShared = data;
        },
      });
    });
    const queries: string[] = [];
    await page.route("**/api/ask", async (route) => {
      const { query } = route.request().postDataJSON() as { query: string };
      queries.push(query);
      await fulfill(
        route,
        answer({
          answer: `Answer for ${query}`,
          sources: [source(1)],
        }),
      );
    });

    await page.goto("/ask?q=Find%20dinner%20downtown");
    await expect(page.getByText("Answer for Find dinner downtown")).toBeVisible();
    await submit(page, "closer");
    const contextual = "Find dinner downtown. Follow-up: closer";
    await expect(page.getByText("Follow-up: closer")).toBeVisible();
    await expect.poll(() => queries.at(-1)).toBe(contextual);
    expect(new URL(page.url()).searchParams.get("q")).toBe(contextual);

    await page.getByRole("button", { name: "Share question" }).click();
    await expect(page.getByRole("button", { name: "Shared" })).toBeVisible();
    const shared = await page.evaluate(
      () => (window as Window & { __askShared?: ShareData }).__askShared,
    );
    expect(shared?.url).toContain(encodeURIComponent(contextual));
    expect(shared?.url).not.toMatch(/lat=|lng=|taste=|saved/i);

    const callsBeforeBack = queries.length;
    await page.getByRole("link", { name: "Source 1", exact: true }).click();
    await page.waitForURL("**/about");
    await page.goBack();
    await expect(page.getByText("Follow-up: closer")).toBeVisible();
    expect(queries).toHaveLength(callsBeforeBack);

    await page.reload();
    await expect(page.getByText("Follow-up: closer")).toBeVisible();
    expect(queries.at(-1)).toBe(contextual);
  });

  test("keeps the full tool directory one tap away in Compass", async ({ page }) => {
    await page.goto("/ask");
    await expect(page.getByRole("navigation", { name: "Featured Radius tools" })).toHaveCount(0);
    await expect(page.locator("#all-radius-tools")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Browse tools" })).toHaveAttribute(
      "href",
      "/compass",
    );
  });
});
