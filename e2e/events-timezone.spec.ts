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
  const body = await page.locator("body").innerText();

  // Times are 12-hour AM/PM, never a bare 24-hour or ISO fragment.
  expect(body).toMatch(/\b\d{1,2}:\d{2}\s?(AM|PM)\b/);

  const punch = body.match(/Punch Brothers[\s\S]{0,80}/i)?.[0];
  test.skip(!punch, "Punch Brothers not in current seed window");
  expect(punch).toContain("8:00 PM");
  expect(punch).not.toContain("4:00 PM");
});
