import { expect, test, type Page } from "@playwright/test";

const VIEWPORT = { width: 390, height: 844 } as const;

const LIVE_DECK = {
  readAt: new Date(Date.now() + 60_000).toISOString(),
  keys: [
    {
      id: "events",
      status: "ok",
      source: "Unified events",
      checkedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 600_000).toISOString(),
      faces: [{ value: "4", label: "on today" }],
    },
    {
      id: "buses",
      status: "ok",
      source: "TransIT",
      checkedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 600_000).toISOString(),
      faces: [{ value: "10", label: "buses moving" }],
    },
    {
      id: "weather",
      status: "ok",
      source: "NWS",
      checkedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 600_000).toISOString(),
      faces: [{ value: "1", label: "active alert" }],
    },
  ],
};

async function installLayoutShiftObserver(page: Page) {
  await page.addInitScript(() => {
    const tracked = window as typeof window & {
      __compassLayoutShift: number;
      __compassLayoutShiftEntries: Array<{
        value: number;
        sources: string[];
      }>;
    };
    tracked.__compassLayoutShift = 0;
    tracked.__compassLayoutShiftEntries = [];
    new PerformanceObserver((list) => {
      for (const shift of list.getEntries() as Array<
        PerformanceEntry & {
          value?: number;
          hadRecentInput?: boolean;
          sources?: Array<{ node?: Node }>;
        }
      >) {
        if (shift.hadRecentInput) continue;
        tracked.__compassLayoutShift += shift.value ?? 0;
        tracked.__compassLayoutShiftEntries.push({
          value: shift.value ?? 0,
          sources: (shift.sources ?? []).map(({ node }) => {
            if (!(node instanceof HTMLElement)) return node?.nodeName ?? "unknown";
            const id = node.id ? `#${node.id}` : "";
            const classes = Array.from(node.classList)
              .slice(0, 4)
              .map((name) => `.${name}`)
              .join("");
            return `${node.tagName.toLowerCase()}${id}${classes}`;
          }),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

test.use({
  viewport: VIEWPORT,
  isMobile: true,
  hasTouch: true,
});

test("Compass keeps Choose a direction still when live counts arrive", async ({
  page,
}) => {
  await installLayoutShiftObserver(page);
  await page.route("**/api/deck", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: LIVE_DECK,
    });
  });

  await page.goto("/compass", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { level: 1, name: "What do you need?" }),
  ).toBeVisible();
  const browse = page.locator('section[aria-labelledby="compass-browse-heading"]');
  await expect(browse.getByRole("heading", { name: "Choose a direction" })).toBeVisible();
  await expect(browse).toHaveAttribute("aria-busy", "true");
  const boxBefore = await browse.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { height: box.height, top: box.top };
  });

  await expect(browse).not.toHaveAttribute("aria-busy", { timeout: 10_000 });
  await expect(page.getByRole("link", { name: /Weather alert/ })).toBeVisible();
  await expect(browse.getByText("4 on today")).toBeVisible();
  await expect(browse.getByText("10 buses moving")).toBeVisible();
  const boxAfter = await browse.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { height: box.height, top: box.top };
  });
  expect(boxAfter.top).toBe(boxBefore.top);
  expect(boxAfter.height).toBe(boxBefore.height);

  const layoutShift = await page.evaluate(() => {
    const tracked = window as typeof window & {
      __compassLayoutShift: number;
      __compassLayoutShiftEntries: Array<{ value: number; sources: string[] }>;
    };
    return {
      score: tracked.__compassLayoutShift,
      entries: tracked.__compassLayoutShiftEntries,
    };
  });

  console.log(`compass CLS at 390x844: ${layoutShift.score.toFixed(4)}`);
  expect(
    layoutShift.score,
    JSON.stringify(layoutShift.entries, null, 2),
  ).toBeLessThan(0.05);
});
