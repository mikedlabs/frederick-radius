import { afterEach, expect, it, vi } from "vitest";
import { fetchDayPlanHydration, parseDayPlanHydration } from "./dayPlanHydration";
const event = { slug: "canonical", title: "Listed event", description: "", starts_at: "2026-10-08T20:00:00Z", ends_at: "2026-10-08T22:00:00Z", venue_name: "Park", category: "music", audience: [] };
const payload = (extra: Record<string, unknown> = {}) => ({ events: [event], resolvedSlugs: [{ requestedSlug: "legacy", canonicalSlug: "canonical" }], missingSlugs: [], unresolvedSlugs: [], degraded: false, ...extra });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("keeps exact requested aliases and separates a healthy missing reference", () => {
  expect(parseDayPlanHydration(payload({ missingSlugs: ["gone"] }), ["legacy", "gone"])).toMatchObject({ resolvedSlugs: [{ requestedSlug: "legacy", canonicalSlug: "canonical" }], missingSlugs: ["gone"], degraded: false });
});
it("treats an omitted older-response reference as unresolved", () => {
  expect(parseDayPlanHydration({ events: [{ ...event, slug: "legacy" }] }, ["legacy", "unknown"])).toMatchObject({ unresolvedSlugs: ["unknown"], missingSlugs: [], degraded: true });
});
it.each([
  payload({ resolvedSlugs: [{ requestedSlug: "unrequested", canonicalSlug: "canonical" }] }),
  payload({ resolvedSlugs: [{ requestedSlug: "legacy", canonicalSlug: "absent" }] }),
  payload({ missingSlugs: ["legacy"] }),
  payload({ unresolvedSlugs: ["unknown"] }),
  payload({ resolvedSlugs: [] }),
  payload({ events: [{ ...event, starts_at: "invalid" }] }),
  payload({ events: [{ ...event, title: {} }] }),
  payload({ events: [event, event] }),
])("rejects inconsistent identity/status or unsafe row shapes", (value) => {
  expect(() => parseDayPlanHydration(value, ["legacy", "other"])).toThrow();
});
it("allows multiple saved aliases to resolve to one public row", () => {
  const mappings = ["legacy", "other"].map((requestedSlug) => ({ requestedSlug, canonicalSlug: "canonical" }));
  expect(parseDayPlanHydration(payload({ resolvedSlugs: mappings }), ["legacy", "other"]).resolvedSlugs).toEqual(mappings);
});
it("does no transport for a pre-cancelled request", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); const parent = new AbortController(); parent.abort();
  await expect(fetchDayPlanHydration(["legacy"], parent.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["headers", "body"])("bounds a stalled %s even when transport ignores cancellation", async (phase) => {
  vi.useFakeTimers(); let signal!: AbortSignal;
  vi.stubGlobal("fetch", vi.fn((_url, init) => { signal = init.signal;
    return phase === "headers" ? new Promise(() => {}) : Promise.resolve({ ok: true, json: () => new Promise(() => {}) });
  }));
  const pending = fetchDayPlanHydration(["legacy"], new AbortController().signal, 100);
  const failed = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(100); await failed; expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
});
it("cancels body parsing and consumes its late completion", async () => {
  let finish!: (value: unknown) => void; const parent = new AbortController();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => new Promise((resolve) => { finish = resolve; }) }));
  const pending = fetchDayPlanHydration(["legacy"], parent.signal); const failed = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await Promise.resolve(); parent.abort(); await failed; finish(payload()); await Promise.resolve();
});
it("disposes its deadline and parent listener after a fast valid read", async () => {
  vi.useFakeTimers(); const parent = new AbortController(); const remove = vi.spyOn(parent.signal, "removeEventListener");
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload()))); vi.stubGlobal("fetch", fetch);
  await fetchDayPlanHydration(["legacy"], parent.signal);
  expect(vi.getTimerCount()).toBe(0); expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  expect(fetch).toHaveBeenCalledWith("/api/events/by-slugs", expect.objectContaining({ method: "POST", cache: "no-store", credentials: "same-origin", body: JSON.stringify({ slugs: ["legacy"] }) }));
});
