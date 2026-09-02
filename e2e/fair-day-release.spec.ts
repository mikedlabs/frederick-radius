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

  test("keeps tickets, travel, planning, help, and official handoffs ready", async ({
    page,
  }) => {
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
        name: "Plan Friday at the Fair.",
      }),
    ).toBeVisible();
    await expect(page.locator("article[data-fair-app]")).toHaveAttribute(
      "data-fair-interaction-ready",
      "true",
      { timeout: 15_000 },
    );
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Send feedback")).toHaveCount(0);

    const datePicker = page.getByLabel("Choose your Fair day", {
      exact: false,
    });
    await datePicker.selectOption("2026-09-20");
    await expect(datePicker).toHaveValue("2026-09-20");
    await expect(
      page.getByRole("heading", { level: 1, name: "Plan Sunday at the Fair." }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Review tickets" }).click();
    await page.getByRole("button", { name: "Compare tickets" }).click();
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
    await page.getByRole("button", { name: "Close Tickets" }).click();

    await page
      .getByRole("button", { name: "Travel", exact: true })
      .click();
    const transitChoice = page.getByRole("radio", { name: /County Transit/ });
    await transitChoice.locator("..").click();
    await expect(transitChoice).toBeChecked();
    await expect(
      page.getByText(/Fair-date service and arrival times are not confirmed/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open Radius Transit" }),
    ).toHaveAttribute("href", "/transit");

    await page.getByText("Sources and limits").click();
    const transitSource = page.getByRole("link", {
      name: "Open the official information",
    });
    await expect(transitSource).toHaveAttribute("href", COUNTY_TRANSIT_URL);
    await expect(transitSource).toHaveAttribute("target", "_blank");
    await expect(transitSource).toHaveAttribute("rel", "noopener noreferrer");

    await page.getByRole("button", { name: "Find", exact: true }).click();
    const eventHubLink = page.getByRole("link", { name: "Vendor map" });
    await expect(eventHubLink).toHaveAttribute("href", EVENTHUB_URL);
    await expect(eventHubLink).toHaveAttribute("target", "_blank");
    await expect(eventHubLink).toHaveAttribute("rel", "noopener noreferrer");

    const addProgramItem = page
      .getByRole("button", { name: /^Add .+ to My Day$/ })
      .first();
    const addLabel = await addProgramItem.getAttribute("aria-label");
    expect(addLabel).toMatch(/^Add .+ to My Day$/);
    const programTitle = addLabel
      ?.replace(/^Add /, "")
      .replace(/ to My Day$/, "");
    expect(programTitle).toBeTruthy();
    await addProgramItem.click();

    await page
      .getByRole("button", { name: "My Day, 1 saved", exact: true })
      .click();
    const timeline = page.getByRole("list", { name: "My Fair Day timeline" });
    await expect(timeline).toContainText(programTitle ?? "");
    await expect(timeline.locator("li")).toHaveCount(3);

    await page.getByRole("button", { name: "Help" }).click();
    await page.getByRole("button", { name: "Send Fair feedback" }).click();
    await expect(
      page.getByRole("dialog", { name: "Send feedback" }),
    ).toBeVisible();
  });
});
