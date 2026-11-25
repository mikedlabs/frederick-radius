import { expect, test } from "@playwright/test";

test("Day Plan removes a named legacy event and Undo keeps its original row and another tab's update", async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const original = [
    { id: "old-event-reference", added_at: "2025-03-10T09:00:00Z" },
    { id: "another-event", added_at: "2025-03-11T09:00:00Z" },
  ];
  await context.addInitScript(rows => {
    if (sessionStorage.getItem("day-plan-initialized")) return;
    if (!localStorage.getItem("fr:itinerary:v1")) localStorage.setItem("fr:itinerary:v1", JSON.stringify(rows));
    if (!localStorage.getItem("fr:saved:v1")) localStorage.setItem("fr:saved:v1", JSON.stringify([{ type: "event", id: "current-event-reference", saved_at: "2025-03-10T09:00:00Z" }]));
    sessionStorage.setItem("day-plan-initialized", "1");
  }, original);
  await context.route("**/api/events/by-slugs", async route => {
    const { slugs } = route.request().postDataJSON() as { slugs: string[] };
    const events = slugs.map(id => ({
      slug: id === "old-event-reference" ? "current-event-reference" : id,
      title: id === "old-event-reference" ? "Morning walk" : id,
      description: "", starts_at: "2026-10-10T15:00:00Z", ends_at: "2026-10-10T16:00:00Z",
      venue_name: "Carroll Creek", venue_place_slug: null, address: "Frederick", geom: {lat: 39.41, lng: -77.41},
      municipality: "frederick", municipality_name: "Frederick City", category: "arts", category_name: "Arts", audience: [],
      is_free: true, source: "manual", is_verified: false, source_url: null, source_id: id, timezone: "America/New_York",
    }));
    await route.fulfill({ json: { events, resolvedSlugs: slugs.map((id, i) => ({ requestedSlug: id, canonicalSlug: events[i].slug })), unresolvedSlugs: [], missingSlugs: [], degraded: false } });
  });
  await page.goto("/itinerary", { waitUntil: "domcontentloaded" });
  const remove = page.getByRole("button", { name: "Remove Morning walk from Day Plan" });
  await expect(remove).toBeVisible();
  const box = await remove.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  const peer = await context.newPage();
  await peer.goto("/itinerary", { waitUntil: "domcontentloaded" });
  await remove.focus();
  await remove.press("Enter");
  await expect(peer.getByRole("button", { name: "Remove Morning walk from Day Plan" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove another-event from Day Plan" })).toBeFocused();
  const added = { id: "new-event", added_at: "2026-11-01T09:00:00Z" };
  await peer.evaluate(extra => {
    const key = "fr:itinerary:v1";
    localStorage.setItem(key, JSON.stringify([...JSON.parse(localStorage.getItem(key)!), extra]));
  }, added);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(remove).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fr:itinerary:v1")!))).toEqual([...original, added]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fr:saved:v1")!))).toEqual([
    { type: "event", id: "current-event-reference", saved_at: "2025-03-10T09:00:00Z" },
  ]);
  await page.reload();
  await expect(remove).toBeVisible();
});
