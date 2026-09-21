import { expect, test, type Page } from "@playwright/test";

const FAIR_PATH = "/moments/great-frederick-fair-2026";
const SELECTED_DATE = "2026-09-21";
const DANNY_DATE = "2026-09-24";
const PLAN_KEY = "fr:fair-plan:great-frederick-fair-2026:v1";

async function openProgram(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-21T16:00:00-04:00"));
  await page.goto(`${FAIR_PATH}#now`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-fair-app]")).toHaveAttribute("data-fair-interaction-ready", "true", { timeout: 30_000 });
  await page.locator("[data-mobile-action-bar]").getByRole("button", { name: "Program", exact: true }).click();
  const day = page.getByRole("combobox", { name: "Fair day to explore", exact: true });
  await day.selectOption(SELECTED_DATE);
  await expect(day).toHaveValue(SELECTED_DATE);
  const scope = page.getByRole("group", { name: "Program search dates", exact: true });
  await expect(scope.getByRole("button", { name: "Selected day", exact: true })).toHaveAttribute("aria-pressed", "true");
  return { day, scope, search: page.getByRole("searchbox", { name: "Search the Fair", exact: true }) };
}

test.describe("Fair program search dates", () => {
  test.use({
    viewport: { width: 375, height: 812 },
    locale: "en-US",
    timezoneId: "America/New_York",
    serviceWorkers: "block",
  });

  test("keeps selected-day search the default and matches words across event title and place", async ({ page }) => {
    const { day, scope, search } = await openProgram(page);
    await search.fill("Daughtry");
    await expect(page.getByText("No program event matches that search.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Open details for Daughtry/ })).toHaveCount(0);

    await scope.getByRole("button", { name: "All Fair days", exact: true }).click();
    await search.fill("grandstand daughtry");
    const dates = page.locator("[data-fair-program-all-days]");
    const event = dates.getByRole("button", { name: /^Open details for Daughtry/ });
    await expect(event).toBeVisible();
    await expect(dates.locator('h2 time[datetime="2026-09-18"]')).toBeVisible();
    await expect(dates.locator("h2 time")).toHaveCount(1);
    await expect(day).toHaveValue(SELECTED_DATE);

    await search.fill("Daughtry dairy");
    await expect(page.getByText("No program event matches that search.", { exact: true })).toBeVisible();
    await expect(event).toHaveCount(0);
    await expect(scope.getByRole("button", { name: "All Fair days", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("groups all-day matches by actual date without giving future events a live badge", async ({ page }) => {
    const { day, scope, search } = await openProgram(page);
    await scope.getByRole("button", { name: "All Fair days", exact: true }).click();
    await search.fill("grandstand");
    const results = page.locator("[data-fair-program-all-days]");
    await expect(results.getByRole("button", { name: /^Open details for Daughtry/ })).toBeVisible();
    await expect(results.getByRole("button", { name: /^Open details for Danny Gokey/ })).toBeVisible();
    const dates = await results.locator("h2 time").evaluateAll((elements) => elements.map((element) => element.getAttribute("datetime")));
    expect(dates).toContain("2026-09-18");
    expect(dates).toContain(DANNY_DATE);
    expect(dates).toEqual([...new Set(dates)].sort());
    const futureDate = results.locator("section").filter({ has: page.locator(`h2 time[datetime="${DANNY_DATE}"]`) });
    await expect(futureDate.locator("[data-fair-program-live-state]")).toHaveCount(0);
    await expect(day).toHaveValue(SELECTED_DATE);
  });

  test("finds the three published Bluey visits and names their PDF source accurately", async ({ page }) => {
    const { scope, search } = await openProgram(page);
    await scope.getByRole("button", { name: "All Fair days", exact: true }).click();
    await search.fill("Bluey");
    const visits = page.locator("[data-fair-program-all-days]").getByRole("button", { name: /^Open details for Bluey/ });
    await expect(visits).toHaveCount(3);
    await visits.first().click();
    const detail = page.getByRole("dialog", { name: /^Bluey/ });
    await expect(detail.getByRole("link", { name: "Official program source", exact: true })).toHaveAttribute("href", /2026-GFF-SoE_website\.pdf#page=/);
    await expect(detail.getByRole("link", { name: "Official Grandstand source", exact: true })).toHaveCount(0);
  });

  test("Back closes a cross-day event and preserves the search scope, query, date and opener", async ({ page }) => {
    const { day, scope, search } = await openProgram(page);
    await scope.getByRole("button", { name: "All Fair days", exact: true }).click();
    await search.fill("grandstand Danny Gokey");
    const opener = page.locator("[data-fair-program-all-days]").getByRole("button", { name: /^Open details for Danny Gokey/ });
    await opener.click();
    const detail = page.getByRole("dialog", { name: /^Danny Gokey/ });
    await expect(detail).toBeVisible();
    await expect(page.locator('dialog[open], [role="dialog"][data-state="open"]')).toHaveCount(1);
    await page.goBack();
    await expect(detail).toBeHidden();
    await expect(page).toHaveURL(`${FAIR_PATH}#program`);
    await expect(day).toHaveValue(SELECTED_DATE);
    await expect(search).toHaveValue("grandstand Danny Gokey");
    await expect(scope.getByRole("button", { name: "All Fair days", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(opener).toBeFocused();
    await page.goForward();
    await expect(detail).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(detail).toBeHidden();
    await expect(page).toHaveURL(`${FAIR_PATH}#program`);
    await expect(day).toHaveValue(SELECTED_DATE);
    await expect(search).toHaveValue("grandstand Danny Gokey");
    await expect(scope.getByRole("button", { name: "All Fair days", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(opener).toBeFocused();
  });

  test("saves an all-day result to its event date without moving the selected planning day", async ({ page }) => {
    const { day, scope, search } = await openProgram(page);
    await scope.getByRole("button", { name: "All Fair days", exact: true }).click();
    await search.fill("Danny Gokey");
    const results = page.locator("[data-fair-program-all-days]");
    const row = results.locator("li").filter({ has: page.getByRole("button", { name: /^Open details for Danny Gokey/ }) });
    const save = row.locator("[data-fair-plan-toggle]");
    const scheduleItemId = await save.getAttribute("data-fair-plan-toggle");
    expect(scheduleItemId).toBeTruthy();
    await expect(save).toHaveAttribute("aria-pressed", "false");
    await expect(row.locator("[data-fair-program-live-state]")).toHaveCount(0);
    await save.click();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.evaluate((key) => {
      const plan = JSON.parse(localStorage.getItem(key) ?? "null");
      return { selectedDayId: plan?.selectedDayId, steps: plan?.steps };
    }, PLAN_KEY)).toMatchObject({
      selectedDayId: `day-${SELECTED_DATE}`,
      steps: [expect.objectContaining({ scheduleItemId, dayId: `day-${DANNY_DATE}` })],
    });
    await expect(day).toHaveValue(SELECTED_DATE);
    await expect(scope.getByRole("button", { name: "All Fair days", exact: true })).toHaveAttribute("aria-pressed", "true");

    await page.locator("[data-mobile-action-bar]").getByRole("button", { name: /^My Day/ }).click();
    const savedDay = page.getByRole("combobox", { name: "Fair day in My Day", exact: true });
    await expect(savedDay).toHaveValue(SELECTED_DATE);
    await expect(page.getByRole("list", { name: "My Fair Day timeline", exact: true })).toHaveCount(0);
    await savedDay.selectOption(DANNY_DATE);
    await expect(page.getByRole("list", { name: "My Fair Day timeline", exact: true })).toContainText("Danny Gokey");
  });

  test("Back dismisses a show opened from the hashless Fair home page", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-21T16:00:00-04:00"));
    await page.goto(FAIR_PATH, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-fair-app]")).toHaveAttribute("data-fair-interaction-ready", "true", { timeout: 30_000 });
    const day = page.getByRole("combobox", { name: "Fair day in your plan", exact: true });
    await day.selectOption(DANNY_DATE);
    const opener = page.locator("[data-fair-grandstand-highlight]").getByRole("button", { name: /^Open details for Danny Gokey/ });
    await expect(opener).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    await opener.click();
    const detail = page.getByRole("dialog", { name: /^Danny Gokey/ });
    await expect(detail).toBeVisible();
    await page.goBack();
    await expect(detail).toBeHidden();
    await expect(page).toHaveURL(FAIR_PATH);
    await expect(page.getByRole("heading", { name: "The Great Frederick Fair", level: 1, exact: true })).toBeVisible();
    await expect(day).toHaveValue(DANNY_DATE);
    await expect(opener).toBeFocused();
  });

  test("shows a cross-day program place on the map and returns to the original day and search", async ({ page }) => {
    const { day, scope, search } = await openProgram(page);
    await scope.getByRole("button", { name: "All Fair days", exact: true }).click();
    await search.fill("grandstand Danny Gokey");
    await page.locator("[data-fair-program-all-days]").getByRole("button", { name: /^Open details for Danny Gokey/ }).click();
    const detail = page.getByRole("dialog", { name: /^Danny Gokey/ });
    await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: "Show on map", exact: true }).click();
    const grounds = page.locator("[data-fair-grounds-map]");
    await expect(grounds.locator("canvas")).toBeVisible({ timeout: 30_000 });
    await expect(detail).toBeHidden();
    const place = grounds.locator("[data-fair-map-selection]:visible");
    await expect(place).toContainText("Grandstand");
    await expect(place).toContainText("Danny Gokey");
    await expect(grounds).toContainText(/Thu(?:rsday)?,?\s+Sep(?:tember)?\s+24/);
    await expect(grounds).not.toContainText("That program place is not available on the reviewed Fair map.");
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.selectedDayId, PLAN_KEY)).toBe(`day-${SELECTED_DATE}`);

    await page.locator("[data-mobile-action-bar]").getByRole("button", { name: "Program", exact: true }).click();
    await expect(page).toHaveURL(`${FAIR_PATH}#program`);
    await expect(day).toHaveValue(SELECTED_DATE);
    await expect(search).toHaveValue("grandstand Danny Gokey");
    await expect(scope.getByRole("button", { name: "All Fair days", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-fair-program-all-days]").getByRole("button", { name: /^Open details for Danny Gokey/ })).toBeVisible();
  });
});
