import { expect, test } from "@playwright/test";
import { registerWebkitLoopbackDocumentSeam } from "./webkit-loopback-document";

test.use({ isMobile: true, hasTouch: true, serviceWorkers: "block" });
registerWebkitLoopbackDocumentSeam();

for (const width of [320, 390]) {
  test(`native Back closes edited Event filters before leaving Events at ${width}px`, async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width, height: 844 });
    const origin = new URL(baseURL!).origin;
    await context.addCookies([{ name: "fr_onboarded", value: "1", url: origin }]);
    await context.route("**/*", route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin || request.resourceType() === "image") return route.abort();
      if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: null } });
      if (!["GET", "HEAD"].includes(request.method())) return route.abort();
      if (url.pathname.startsWith("/api/") && url.pathname !== "/api/events/browse") return route.abort();
      return route.fallback();
    });
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    await page.goto("/events?in=thurmont&lens=weekend", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-events-interaction-ready]")).toHaveAttribute("data-events-interaction-ready", "true");
    const trigger = page.getByRole("button", { name: /^Filters/ });
    const dialog = page.getByRole("dialog", { name: "Event filters" });
    const appliedUrl = page.url();
    const free = dialog.getByRole("button", { name: "Free", exact: true });
    const search = dialog.getByRole("textbox", { name: "Filter the events shown" });
    const openWhat = async () => {
      await trigger.tap();
      await dialog.getByRole("tab", { name: "What", exact: true }).tap();
    };
    for (const method of ["Back", "Cancel", "Escape"]) {
      await openWhat();
      await expect(free).toHaveAttribute("aria-pressed", "false");
      await expect(search).toHaveValue("");
      await free.tap();
      await search.fill("local music");
      await expect(page).toHaveURL(appliedUrl);
      if (method === "Back") await page.goBack();
      else if (method === "Cancel") await dialog.getByRole("button", { name: "Cancel" }).tap();
      else await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(trigger).not.toHaveAccessibleName(/local music/);
      await expect(page).toHaveURL(appliedUrl);
      await expect.poll(() => page.evaluate(() => window.history.state?.__frederickRadiusLayer ?? null)).toBeNull();
    }
    await openWhat();
    await free.tap();
    await search.fill("local music");
    await dialog.getByRole("button", { name: /^Show (?:results|\d+ events?)$/ }).tap();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(/free=true/);
    await expect(trigger).toHaveAccessibleName(/local music/);
    await expect(page.locator("[data-event-filter-time]")).toHaveText("This weekend");
    await expect(page.locator("[data-event-filter-scope]")).toHaveText("Thurmont");
    await page.goBack();
    await expect(page).toHaveURL(/\/today(?:\?|$)/);
  });
}
