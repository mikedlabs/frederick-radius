import { expect, test } from "@playwright/test";
import path from "node:path";

const AXE_PATH = path.join(process.cwd(), "node_modules/axe-core/axe.min.js");

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("Today restores the current event board after a promoted-build archive miss", async ({
  page,
}) => {
  let recoveryRequests = 0;
  await page.route("**/api/today/events", async (route) => {
    recoveryRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        partial: false,
        events: [
          {
            slug: "black-frederick-festival-2026-08-22",
            title: "Black Frederick Festival",
            venue: "Carroll Creek Outdoor Amphitheater",
            municipality: "frederick",
            time: "12:00 PM",
            moment: "Now",
            image: null,
            free: false,
            when: "Sat, Aug 22 · 12:00 PM–6:00 PM",
            description:
              "A community celebration with performances, food, vendors, and activities for all ages.",
            address: "50 Carroll Creek Way, Frederick, MD 21701",
            admission: "Not listed by the event source",
            sourceLabel: "Downtown Frederick Partnership",
            sourceUrl:
              "https://downtownfrederick.org/vm-event/black-frederick-festival/",
            highlight: true,
          },
        ],
      }),
    });
  });

  await page.goto("/today", { waitUntil: "domcontentloaded" });

  const recovery = page.locator('[data-today-event-recovery="true"]');
  await expect(recovery).toBeVisible();
  await expect(
    recovery.getByRole("link", { name: "Black Frederick Festival" }),
  ).toHaveAttribute(
    "href",
    "/events/black-frederick-festival-2026-08-22",
  );
  await expect(recovery).toContainText("On Carroll Creek now");
  await expect(recovery).toContainText("Carroll Creek Outdoor Amphitheater");
  await expect(recovery).toContainText("Sat, Aug 22 · 12:00 PM–6:00 PM");
  await expect(recovery).toContainText(
    "Admission · Not listed by the event source",
  );
  await expect(recovery).toContainText("Source · Downtown Frederick Partnership");
  await expect(recovery.getByRole("link", { name: "Official event page" })).toHaveAttribute(
    "href",
    "https://downtownfrederick.org/vm-event/black-frederick-festival/",
  );
  await expect(
    recovery.locator('[data-today-event-highlight="carroll-creek"]'),
  ).toBeVisible();
  await page.addScriptTag({ path: AXE_PATH });
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: Document,
            options: object,
          ) => Promise<{ violations: Array<{ id: string }> }>;
        };
      }
    ).axe;
    const result = await axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
      resultTypes: ["violations"],
    });
    return result.violations.map((violation) => violation.id);
  });
  expect(violations).toEqual([]);
  expect(recoveryRequests).toBe(1);
});
