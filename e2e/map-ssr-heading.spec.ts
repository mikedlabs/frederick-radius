import { expect, test } from "@playwright/test";

test("the map exposes one heading before and after hydration", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const response = await request.get("/map", { timeout: 90_000 });
  expect(response.status()).toBe(200);

  const rawHtml = await response.text();
  const rawHeadings = rawHtml.match(/<h1\b[^>]*>/g) ?? [];
  expect(rawHeadings).toHaveLength(1);
  expect(rawHtml).toMatch(
    /<h1\b[^>]*class="[^"]*sr-only[^"]*"[^>]*>Frederick County map<\/h1>/,
  );

  await page.goto("/map", { waitUntil: "domcontentloaded" });
  const headings = page.locator("main h1");
  await expect(headings).toHaveCount(1);
  await expect(headings).toHaveText("Frederick County map");
  await expect(headings).toHaveClass(/\bsr-only\b/);
});
