import { test, expect } from "@playwright/test";

/**
 * P0-1 acceptance: events render in America/New_York, not UTC.
 *
 * The headline regression was the Events list showing every event four
 * hours early. Punch Brothers must read 8:00 PM (it read 4:00 PM during
 * the bug). The named-event check skips gracefully if the seed no longer
 * carries that dated event, so the suite does not rot; the deterministic
 * proof lives in tests/eventTime.spec.ts.
 */
test("events list renders New York times, not UTC", async ({ page }) => {
  await page.goto("/events");
  // The event board streams behind a Suspense boundary while the live feeds
  // resolve. Wait for the board contract, not the static footer shell.
  await expect(
    page.getByRole("heading", { name: "Events in Frederick County" }),
  ).toBeAttached({ timeout: 20_000 });
  const body = await page.locator("body").innerText();

  // Times are 12-hour AM/PM, never a bare 24-hour or ISO fragment.
  expect(body).toMatch(/\b\d{1,2}:\d{2}\s?(AM|PM)\b/);

  const punch = body.match(/Punch Brothers[\s\S]{0,80}/i)?.[0];
  test.skip(!punch, "Punch Brothers not in current seed window");
  expect(punch).toContain("8:00 PM");
  expect(punch).not.toContain("4:00 PM");
});

/**
 * The week ribbon reads Eastern days and is the board's one date control
 * (UI review, Oct 2026: "Tomorrow" and "This weekend" chips repeated ribbon
 * cells above it). Seven day cells, today first, and the only weekend
 * shortcut sits on the ribbon's caption line, not in the dock.
 */
test("the week ribbon is the one date control, starting on today", async ({ page }) => {
  await page.goto("/events");
  await expect(page.locator("[data-events-interaction-ready]")).toHaveAttribute(
    "data-events-interaction-ready",
    "true",
    { timeout: 30_000 },
  );

  const when = page.getByRole("group", { name: "When" });
  await expect(when).toHaveCount(1);
  const days = when.getByRole("button", {
    name: /^(?:Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day \d+/,
  });
  await expect(days).toHaveCount(7);
  await expect(days.first()).toHaveAttribute("aria-label", /, today\b/);
  const weekend = when.getByRole("button", { name: "This weekend", exact: true });
  await expect(weekend).toHaveAttribute("aria-pressed", "false");

  const dock = page.locator(".eb-dock");
  for (const chip of ["Today", "Tonight", "Tomorrow", "This weekend"]) {
    await expect(dock.getByRole("button", { name: chip, exact: true })).toHaveCount(0);
  }

  // Selecting the weekend outlines Friday to Sunday, but no cell's name may
  // contain the button's name: Playwright and voice control both match it
  // as a substring, and "This weekend" must still reach one control.
  await weekend.click();
  await expect(weekend).toHaveAttribute("aria-pressed", "true");
  await expect(when.getByRole("button", { name: "This weekend" })).toHaveCount(1);
});
