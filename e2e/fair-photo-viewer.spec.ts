import { expect, test, type Page } from "@playwright/test";

// This suite must exercise the real document CSP, unlike general layout QA.
test.use({ bypassCSP: false });

async function openHarness(page: Page) {
  await page.route("**/__fair-photo-proof", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><body><button id="open">Explore the photo</button><output id="message"></output><script>
      document.getElementById('open').onclick = () => {
        const frame = document.createElement('iframe');
        frame.title = 'Fair photograph'; frame.width = '390'; frame.height = '220';
        frame.src = '/fair-photo-viewer'; document.body.append(frame);
      };
      addEventListener('message', event => {
        if(event.origin === location.origin && event.source === document.querySelector('iframe')?.contentWindow)
          document.getElementById('message').textContent = JSON.stringify(event.data);
      });
    </script></body></html>`,
  }));
  await page.goto("/__fair-photo-proof");
}

test("viewer has one scoped policy while the ordinary app remains restricted", async ({ request }) => {
  const viewer = await request.get("/fair-photo-viewer");
  expect(viewer.ok()).toBe(true);
  const policy = viewer.headers()["content-security-policy"];
  expect(policy.match(/default-src/g)).toHaveLength(1);
  expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(policy).toContain("connect-src 'self' data:");
  expect(policy).not.toContain("'unsafe-eval'");
  expect(policy).toContain("frame-ancestors 'self'");
  const app = await request.get("/manifest.webmanifest");
  expect(app.headers()["content-security-policy"]).not.toContain("wasm-unsafe-eval");
  expect(app.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("loads on demand, renders the real photograph, and releases the canvas", async ({ page }) => {
  const errors: string[] = [];
  const assets: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/fair-viewer-assets/")) assets.push(request.url());
  });
  await openHarness(page);
  expect(assets).toEqual([]);
  await page.getByRole("button", { name: "Explore the photo" }).click();
  await expect(page.locator("#message")).toContainText('"status":"ready"', { timeout: 15_000 });
  await expect(page.frameLocator("iframe").getByRole("img")).toBeVisible();
  await expect(page.frameLocator("iframe").locator("canvas")).toHaveCount(0, { timeout: 10_000 });
  expect(assets.length).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

for (const scenario of ["motion", "data", "webgl"] as const) {
  test(`${scenario} fallback avoids heavyweight renderer requests`, async ({ page }) => {
    const assets: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.url().includes("/fair-viewer-assets/")) assets.push(new URL(request.url()).pathname);
    });
    if (scenario === "motion") await page.emulateMedia({ reducedMotion: "reduce" });
    if (scenario === "data") await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", { value: { saveData: true } });
    });
    if (scenario === "webgl") await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
        if (args[0] === "webgl2") return null;
        return original.apply(this, args);
      } as typeof original;
    });
    await openHarness(page);
    await page.getByRole("button", { name: "Explore the photo" }).click();
    await expect(page.locator("#message")).toContainText(`"reason":"${scenario}"`);
    await expect(page.frameLocator("iframe").getByRole("img")).toBeVisible();
    expect(assets).toEqual(["/fair-viewer-assets/viewer.js"]);
    expect(errors).toEqual([]);
  });
}
