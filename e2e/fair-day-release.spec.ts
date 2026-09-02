import { expect, test } from "@playwright/test";

const FAIR_CANONICAL_PATH = "/moments/great-frederick-fair-2026";
const ETIX_ADMISSION_URL =
  "https://www.etix.com/ticket/v/11115/the-great-frederick-fair-advanced-gate?partner_id=944";
const COUNTY_TRANSIT_URL =
  "https://www.frederickcountymd.gov/105/Transit-Services";
const EVENTHUB_URL =
  "https://mobile.eventhub-floorplan.net/?Show_ID=18209";

test.describe("Fair Day production release journey", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    locale: "en-US",
    timezoneId: "America/New_York",
    serviceWorkers: "block",
  });

  test("keeps planning, official handoffs, and Find ready", async ({ page }) => {
    test.setTimeout(90_000);

    const redirect = await page.request.get("/fair", { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    expect(redirect.headers().location).toBe(FAIR_CANONICAL_PATH);

    const response = await page.goto("/fair", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${FAIR_CANONICAL_PATH}$`));
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Ready before you leave.",
      }),
    ).toBeVisible();

    const findTrigger = page.getByRole("button", {
      name: "Ask or find across Frederick County",
    });
    await expect(findTrigger).toBeVisible();
    await expect(findTrigger).toHaveAttribute(
      "data-find-interaction-ready",
      "true",
      { timeout: 15_000 },
    );

    const datePicker = page.getByLabel("Choose your Fair day", {
      exact: false,
    });
    await datePicker.selectOption("2026-09-20");
    await expect(datePicker).toHaveValue("2026-09-20");

    await page
      .getByRole("button", { name: "Compare ticket options" })
      .click();
    await page.getByRole("spinbutton", { name: "Adults 11+" }).fill("2");

    const ticketCombination = page.getByRole("list", {
      name: "Reviewed party ticket combination",
    });
    await expect(ticketCombination).toContainText(
      "2 × Adult admission online",
    );
    await expect(ticketCombination).toContainText("$20");

    const etixLink = page.getByRole("link", {
      name: "Continue to Etix for Adult admission online",
    });
    await expect(etixLink).toHaveAttribute("href", ETIX_ADMISSION_URL);
    await expect(etixLink).toHaveAttribute("target", "_blank");
    await expect(etixLink).toHaveAttribute("rel", "noopener noreferrer");

    await page
      .getByRole("button", { name: "2. Arrival and parking" })
      .click();
    const transitChoice = page.getByRole("radio", { name: /County Transit/ });
    await transitChoice.locator("..").click();
    await expect(transitChoice).toBeChecked();

    const arrivalPanel = page.locator("#fair-ready-arrival");
    await expect(arrivalPanel).toContainText("County Transit");
    await expect(arrivalPanel).toContainText("not a service promise");
    const transitLink = arrivalPanel.getByRole("link", {
      name: "Check the official visit page",
    });
    await expect(transitLink).toHaveAttribute("href", COUNTY_TRANSIT_URL);
    await expect(transitLink).toHaveAttribute("target", "_blank");
    await expect(transitLink).toHaveAttribute("rel", "noopener noreferrer");

    const addProgramItem = page
      .getByRole("button", { name: /^Add .+ to My Fair Day$/ })
      .first();
    const addLabel = await addProgramItem.getAttribute("aria-label");
    expect(addLabel).toMatch(/^Add .+ to My Fair Day$/);
    const programTitle = addLabel
      ?.replace(/^Add /, "")
      .replace(/ to My Fair Day$/, "");
    expect(programTitle).toBeTruthy();
    await addProgramItem.click();

    await expect(
      page.getByRole("link", { name: "Plan, 1 saved program stop" }),
    ).toBeVisible();
    const numberedPlan = page.getByRole("list", {
      name: "My numbered Fair Day plan",
    });
    await expect(numberedPlan).toContainText(programTitle ?? "");
    await expect(numberedPlan.locator("li")).toHaveCount(3);

    const eventHubLink = page.getByRole("link", {
      name: "EventHub",
      exact: true,
    });
    await expect(eventHubLink).toHaveAttribute("href", EVENTHUB_URL);
    await expect(eventHubLink).toHaveAttribute("target", "_blank");
    await expect(eventHubLink).toHaveAttribute("rel", "noopener noreferrer");

    await findTrigger.click();
    const immediateFindDialog = page.locator("#radius-find-dialog");
    await expect(immediateFindDialog).toBeVisible({ timeout: 1_000 });
    await expect(immediateFindDialog).toHaveAttribute("role", "dialog");
    await expect(immediateFindDialog).toHaveAccessibleName(
      /Loading search|What do you need\?/,
    );
    await expect(
      page.getByRole("dialog", { name: "What do you need?" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("searchbox", {
        name: "Ask or find across Frederick County",
      }),
    ).toBeVisible();
  });
});
