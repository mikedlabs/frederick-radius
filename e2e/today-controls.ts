import { expect, type Page } from "@playwright/test";

export function todayArea(page: Page) {
  return page.locator("header [data-today-area-trigger]");
}

export async function chooseTodayArea(page: Page, value: string) {
  const area = todayArea(page);
  const select = page.getByRole("combobox", { name: "Choose your area", exact: true });
  if (!(await select.isVisible())) await area.click();
  await expect(select).toBeEnabled();
  await select.selectOption(value);
  if (await select.isVisible()) await area.click();
}

export async function showTodayTools(page: Page) {
  const menu = page.locator("header [data-today-tools-trigger]");
  const tools = page.locator("header").first().getByRole("link", { name: "Open tools", exact: true });
  if (await menu.isVisible() && !(await tools.isVisible())) await menu.click();
  await expect(tools).toBeVisible();
  return tools;
}
