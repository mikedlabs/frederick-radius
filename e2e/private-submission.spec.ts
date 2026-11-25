import { expect, test } from "@playwright/test";

const emailLink = "mailto:hello@frederickradius.app";

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  for (const path of ["/submit/event", "/submit/place", "/submit/place?category=food-truck"]) {
    test(`${path} offers a private email alternative before collecting a draft`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "hello@frederickradius.app" })).toHaveAttribute("href", emailLink);
      await expect(page.locator("form, input[name], textarea[name]")).toHaveCount(0);
    });
  }

  test("sign-in offers a browse link before collecting an email address", async ({ page }) => {
    await page.goto("/auth/login?next=%2Fsettings");
    await expect(page.getByRole("link", { name: "Browse without signing in" })).toHaveAttribute("href", "/");
    await expect(page.locator("form, input[name=email], input[name=code]")).toHaveCount(0);
  });
});

test("a delayed event form becomes usable with its original town selection", async ({ page }) => {
  let resume!: () => void;
  const paused = new Promise<void>((resolve) => { resume = resolve; });
  await page.route(/\/_next\/static\/.*\.js(?:\?|$)/, async (route) => {
    await paused;
    await route.continue();
  });
  try {
    await page.goto("/submit/event?m=brunswick", { waitUntil: "commit" });
    await expect(page.getByRole("link", { name: "hello@frederickradius.app" })).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
  } finally {
    resume();
  }
  await expect(page.getByLabel("Town")).toHaveValue("brunswick");
  await expect(page.locator("form")).toHaveAttribute("method", "post");
});

for (const kind of ["event", "place"] as const) {
  test(`a failed ${kind} delivery preserves the draft and keeps private values out of URLs`, async ({ page }) => {
    const path = `/submit/${kind}`;
    const draft = "Private submission fixture";
    const email = "draft@example.invalid";
    const requestUrls: string[] = [];
    page.on("request", (request) => requestUrls.push(request.url()));
    await page.goto(path);
    const form = page.locator("form");
    await expect(form).toHaveAttribute("method", "post", { timeout: 15_000 });
    const title = page.getByLabel(kind === "event" ? "Event title" : "Place name");
    await title.fill(draft);
    await page.getByLabel("Your email").fill(email);
    if (kind === "event") {
      await page.getByLabel("Starts").fill("2030-05-21T10:00");
    } else {
      await page.getByLabel("Town").selectOption("brunswick");
      await page.getByLabel("Category").selectOption({ index: 1 });
    }

    // Intercept the normal Server Action to exercise a delivery failure without sending anything.
    await page.route((url) => url.pathname === path, async (route) => {
      if (route.request().method() === "POST") await route.abort("connectionfailed");
      else await route.continue();
    });
    const submission = page.waitForRequest((request) =>
      new URL(request.url()).pathname === path && request.method() === "POST");
    await page.getByRole("button", { name: kind === "event" ? "Submit event" : "Submit for review" }).click();
    const request = await submission;
    expect(request.postData()).toContain(email);
    const alert = form.getByRole("alert");
    await expect(alert).toContainText("Your details are still here");
    await expect(alert.getByRole("link")).toHaveAttribute("href", emailLink);
    await expect(title).toHaveValue(draft);
    await expect(page.getByLabel("Your email")).toHaveValue(email);
    expect(new URL(page.url()).search).toBe("");
    expect(requestUrls.map((url) => decodeURIComponent(url)).join("\n")).not.toMatch(/Private submission fixture|draft@example\.invalid/);
  });
}
