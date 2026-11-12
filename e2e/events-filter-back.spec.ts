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
    await trigger.tap();
    await dialog.getByRole("tab", { name: "What", exact: true }).tap();
    await dialog.getByRole("button", { name: "Free", exact: true }).tap();
    await dialog.getByRole("textbox", { name: "Filter the events shown" }).fill("local music");
    await expect(page).toHaveURL(/free=true/);
    const editedUrl = page.url();
    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(editedUrl);
    await expect(trigger).toHaveAccessibleName(/local music/);
    await expect(page.locator("[data-event-filter-time]")).toHaveText("This weekend");
    await expect(page.locator("[data-event-filter-scope]")).toHaveText("Thurmont");

    // Repeated explicit dismissal must consume each newly owned layer once.
    for (const method of ["Done", "Escape"]) {
      await trigger.tap();
      await dialog.getByRole("tab", { name: "What", exact: true }).tap();
      await expect(dialog.getByRole("button", { name: "Free", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(dialog.getByRole("textbox", { name: "Filter the events shown" })).toHaveValue("local music");
      if (method === "Done") await dialog.getByRole("button", { name: "Done", exact: true }).tap();
      else await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
      await expect(page).toHaveURL(editedUrl);
      await expect.poll(() => page.evaluate(() => window.history.state?.__frederickRadiusLayer ?? null)).toBeNull();
    }
    await page.goBack();
    await expect(page).toHaveURL(/\/today(?:\?|$)/);
  });
}
