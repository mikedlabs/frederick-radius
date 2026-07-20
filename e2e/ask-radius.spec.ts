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
  const input = page.getByLabel("Ask Frederick Radius");
  await input.fill(query);
  await input.press("Enter");
}

test.describe("Ask Radius deterministic workspace", () => {
  test.use({ viewport: { width: 390, height: 844 } });

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
    await expect(page.getByText("Source 1", { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Featured Radius tools" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Browse all \d+ tools/ })).toBeVisible();

    await submit(page, "three sources");
    await expect(page.getByText("3 source answer.")).toBeVisible();
    await expect(page.getByText("Source 3", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Show all 3 matches" }).click();
    await expect(page.getByText("Source 3", { exact: true })).toBeVisible();

    await submit(page, "zero sources");
    await expect(page.getByText("0 source answer.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sources behind this answer" })).toHaveCount(0);
  });

  test("renders an editable plan from a mocked response", async ({ page }) => {
    await page.route("**/api/ask", (route) =>
      fulfill(
        route,
        answer({
          answer: "Here is a simple two-stop plan.",
          plan: {
            title: "Downtown date night",
            summary: "Dinner followed by a show.",
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
    await expect(page.getByText("Radius is checking local data.")).toBeVisible();
    await page.waitForTimeout(1_400);
    await expect(page.getByText("Radius is comparing the strongest matches.")).toBeVisible();
    release();
    await expect(page.getByText("The delayed answer arrived.")).toBeVisible();
  });

  test("keeps only the newest overlapping response", async ({ page }) => {
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
    await page.getByLabel("Ask Frederick Radius").fill("second request");
    await page.locator('form[aria-label="Ask Radius"]').evaluate((form) => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
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
    await page.getByLabel("Choose a town").selectOption("urbana");
    await expect(page.getByText("Urbana coffee answer.")).toBeVisible();
    expect(requestBody.scope).toBe("town:urbana");
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
    await expect(page.getByText(`Answer for ${contextual}`)).toBeVisible();
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
    await expect(page.getByText(`Answer for ${contextual}`)).toBeVisible();
    expect(queries).toHaveLength(callsBeforeBack);

    await page.reload();
    await expect(page.getByText(`Answer for ${contextual}`)).toBeVisible();
    expect(queries.at(-1)).toBe(contextual);
  });

  test("shows every tool without repeating featured destinations", async ({ page }) => {
    await page.goto("/ask");
    const featured = page.getByRole("navigation", { name: "Featured Radius tools" });
    await expect(featured.getByRole("link")).toHaveCount(6);

    await page.getByRole("button", { name: /Show all \d+ tools/ }).click();
    const allTools = page.locator("#all-radius-tools a");
    // Every registered tool except the six featured cards (which the "all"
    // list hides while unfiltered). Update alongside the tool registry.
    await expect(allTools).toHaveCount(48);
    const featuredHrefs = await featured.getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );
    const allHrefs = await allTools.evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );
    expect(featuredHrefs.filter((href) => allHrefs.includes(href))).toEqual([]);

    await page.getByLabel("Filter Radius tools").fill("trash");
    await expect(featured).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Trash cans/ })).toBeVisible();
  });
});
