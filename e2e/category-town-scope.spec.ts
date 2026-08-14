import { expect, test, type BrowserContext } from "@playwright/test";

async function setLocationCookies({
  context,
  baseURL,
  scope,
  home,
}: {
  context: BrowserContext;
  baseURL: string | undefined;
  scope?: string;
  home?: string;
}) {
  const app = new URL(baseURL ?? "http://localhost:3010");
  await context.addCookies([
    {
      name: "fr_onboarded",
      value: "1",
      domain: app.hostname,
      path: "/",
    },
    ...(scope
      ? [{ name: "fr_scope", value: scope, domain: app.hostname, path: "/" }]
      : []),
    ...(home
      ? [{ name: "fr_home_muni", value: home, domain: app.hostname, path: "/" }]
      : []),
  ]);
}

test("an explicit town scope hard-filters the real playground category page", async ({
  page,
  context,
  baseURL,
}) => {
  await setLocationCookies({
    context,
    baseURL,
    scope: "town:walkersville",
    home: "frederick",
  });

  const response = await page.goto("/category/playground", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Playgrounds" }),
  ).toBeVisible();
  await expect(
    page.getByText("Walkersville Community Park Playground", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Edward P Thomas Memorial Pool Playground", { exact: true }),
  ).toHaveCount(0);
});

test("a saved home ranks the category without hiding the rest of the county", async ({
  page,
  context,
  baseURL,
}) => {
  await setLocationCookies({
    context,
    baseURL,
    home: "walkersville",
  });

  const response = await page.goto("/category/playground", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(
    page.getByText("Walkersville Community Park Playground", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Edward P Thomas Memorial Pool Playground", { exact: true }).first(),
  ).toBeAttached();

  const scopeSelect = page.locator('select[aria-describedby="scope-status"]');
  await expect(scopeSelect).toHaveValue("ranking-origin");
  await scopeSelect.selectOption("walkersville");
  await expect(scopeSelect).toHaveValue("walkersville");
  await expect(
    page.getByText("Edward P Thomas Memorial Pool Playground", { exact: true }),
  ).toHaveCount(0);
  await expect.poll(async () => {
    const cookie = (await context.cookies()).find(({ name }) => name === "fr_scope");
    return cookie ? decodeURIComponent(cookie.value) : undefined;
  }).toBe("town:walkersville");
});

test("the Coffee category component keeps the selected-town boundary", async ({
  page,
  context,
  baseURL,
}) => {
  await setLocationCookies({
    context,
    baseURL,
    scope: "town:walkersville",
    home: "frederick",
  });

  const response = await page.goto("/category/coffee", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Coffee" }),
  ).toBeVisible();
  await expect(
    page.getByText("Whistle Stop Coffee", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Cafe Nola", { exact: true })).toHaveCount(0);
});
