// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const edge = vi.hoisted(() => ({ push: vi.fn(), toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: edge.push }) }));
vi.mock("sonner", () => ({ toast: edge.toast }));
import ItineraryButton from "./ItineraryButton";
import DayPlanLink from "./DayPlanLink";
import { useToggleItinerary } from "@/hooks/useItinerary";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let container: HTMLDivElement;
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
it("adds the exact event and offers a real Day Plan destination", async () => {
  await act(async () => root.render(<><ItineraryButton eventId="current-event" eventTitle="Listed community event" /><DayPlanLink /></>));
  expect(container.querySelector("button")!.getAttribute("aria-label")).toBe("Add Listed community event to Day Plan");
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector("button")!.getAttribute("aria-label")).toBe("Remove Listed community event from Day Plan");
  expect(JSON.parse(localStorage.getItem("fr:itinerary:v1")!)).toEqual([{ id: "current-event", added_at: expect.any(String) }]);
  const options = edge.toast.success.mock.calls[0][1]; expect(options.action.label).toBe("View Day Plan"); options.action.onClick();
  expect(edge.push).toHaveBeenCalledWith("/itinerary"); expect(container.querySelector("a")!.getAttribute("href")).toBe("/itinerary"); expect(container.textContent).toContain("1 saved");
});
it("reopens existing device data without rewriting its original timestamps", async () => {
  const original = JSON.stringify([{ id: "legacy-event", added_at: "2026-09-01T11:00:00Z" }, { id: "other-event", added_at: "2026-09-02T12:00:00Z" }]); localStorage.setItem("fr:itinerary:v1", original);
  await act(async () => root.render(<><ItineraryButton eventId="legacy-event" eventTitle="Previously saved listing" /><DayPlanLink /></>));
  expect(localStorage.getItem("fr:itinerary:v1")).toBe(original); expect(container.textContent).toContain("2 saved");
  expect(container.querySelector("button")!.getAttribute("aria-label")).toBe("Remove Previously saved listing from Day Plan");
  await act(async () => container.querySelector("button")!.click());
  expect(JSON.parse(localStorage.getItem("fr:itinerary:v1")!)).toEqual([{ id: "other-event", added_at: "2026-09-02T12:00:00Z" }]);
  expect(edge.toast.success).not.toHaveBeenCalled(); expect(edge.toast).toHaveBeenCalledWith("Removed from Day Plan");
});
it("does not claim a successful add when device storage fails", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  await act(async () => root.render(<ItineraryButton eventId="failed-event" />)); await act(async () => container.querySelector("button")!.click());
  expect(edge.toast.success).not.toHaveBeenCalled(); expect(edge.toast.error).toHaveBeenCalledWith(expect.stringContaining("could not update Day Plan"));
});

const itineraryKey = "fr:itinerary:v1";
const preservedAt = "2026-09-01T11:00:00Z";
const unrelatedAt = "2026-09-02T12:00:00Z";

it("honors a displayed Add when another tab has already added the event, without rewriting its date", async () => {
  await act(async () => root.render(<ItineraryButton eventId="shared-event" eventTitle="Shared event" />));
  const add = container.querySelector<HTMLButtonElement>("button")!;
  expect(add.getAttribute("aria-label")).toBe("Add Shared event to Day Plan");
  const latest = JSON.stringify([
    { id: "shared-event", added_at: preservedAt }, { id: "other-event", added_at: unrelatedAt },
  ]);
  // The storage notification from the other document has not arrived yet.
  localStorage.setItem(itineraryKey, latest);
  const write = vi.spyOn(Storage.prototype, "setItem");
  await act(async () => add.click());
  expect(localStorage.getItem(itineraryKey)).toBe(latest);
  expect(write).not.toHaveBeenCalled();
  expect(add.getAttribute("aria-label")).toBe("Remove Shared event from Day Plan");
  expect(edge.toast.success).toHaveBeenCalledWith("Added to Day Plan", expect.any(Object));
});

it("honors a displayed Remove when another tab has already removed the event, without adding it back", async () => {
  localStorage.setItem(itineraryKey, JSON.stringify([{ id: "shared-event", added_at: preservedAt }]));
  await act(async () => root.render(<ItineraryButton eventId="shared-event" eventTitle="Shared event" />));
  const remove = container.querySelector<HTMLButtonElement>("button")!;
  expect(remove.getAttribute("aria-label")).toBe("Remove Shared event from Day Plan");
  const latest = JSON.stringify([{ id: "other-event", added_at: unrelatedAt }]);
  localStorage.setItem(itineraryKey, latest);
  const write = vi.spyOn(Storage.prototype, "setItem");
  await act(async () => remove.click());
  expect(localStorage.getItem(itineraryKey)).toBe(latest);
  expect(write).not.toHaveBeenCalled();
  expect(remove.getAttribute("aria-label")).toBe("Add Shared event to Day Plan");
  expect(edge.toast.success).not.toHaveBeenCalled();
  expect(edge.toast).toHaveBeenCalledWith("Removed from Day Plan");
});

it.each(["{broken", '{"items":[]}', '[{"id":"shared-event"}]', '[{"id":"shared-event","added_at":"bad date"}]'])(
  "fails closed when a newer stored collection is malformed: %s", async (malformed) => {
    await act(async () => root.render(<ItineraryButton eventId="shared-event" />));
    localStorage.setItem(itineraryKey, malformed);
    const write = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(localStorage.getItem(itineraryKey)).toBe(malformed);
    expect(write).not.toHaveBeenCalled();
    expect(edge.toast.success).not.toHaveBeenCalled();
    expect(edge.toast.error).toHaveBeenCalledWith(expect.stringContaining("could not update Day Plan"));
  },
);

it("fails closed when the fresh collection read is unavailable", async () => {
  await act(async () => root.render(<ItineraryButton eventId="shared-event" />));
  const latest = JSON.stringify([{ id: "other-event", added_at: unrelatedAt }]);
  localStorage.setItem(itineraryKey, latest);
  const originalGet = Storage.prototype.getItem;
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
    if (key === itineraryKey) throw new DOMException("Unavailable", "SecurityError");
    return originalGet.call(this, key);
  });
  const write = vi.spyOn(Storage.prototype, "setItem");
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(write).not.toHaveBeenCalled();
  expect(edge.toast.success).not.toHaveBeenCalled();
  expect(edge.toast.error).toHaveBeenCalledWith(expect.stringContaining("could not update Day Plan"));
  read.mockRestore();
  expect(localStorage.getItem(itineraryKey)).toBe(latest);
});

it("updates mounted action and count for this local storage key and clear, while ignoring other storage", async () => {
  await act(async () => root.render(<><ItineraryButton eventId="shared-event" eventTitle="Shared event" /><DayPlanLink /></>));
  localStorage.setItem(itineraryKey, JSON.stringify([{ id: "shared-event", added_at: preservedAt }]));
  await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: "another-key", storageArea: localStorage })));
  expect(container.querySelector("button")!.getAttribute("aria-label")).toBe("Add Shared event to Day Plan");
  await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: itineraryKey, storageArea: sessionStorage })));
  expect(container.querySelector("button")!.getAttribute("aria-label")).toBe("Add Shared event to Day Plan");
  await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: itineraryKey, storageArea: localStorage })));
  expect(container.querySelector("button")!.getAttribute("aria-label")).toBe("Remove Shared event from Day Plan");
  expect(container.textContent).toContain("1 saved");
  localStorage.clear();
  await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage })));
  expect(container.querySelector("button")!.getAttribute("aria-label")).toBe("Add Shared event to Day Plan");
  expect(container.textContent).not.toContain("1 saved");
});

it("owns one native storage listener until the final mounted subscriber leaves", async () => {
  const attach = vi.spyOn(window, "addEventListener");
  const detach = vi.spyOn(window, "removeEventListener");
  await act(async () => root.render(<><ItineraryButton eventId="shared-event" /><DayPlanLink /></>));
  const storageListeners = attach.mock.calls.filter(([name]) => name === "storage");
  expect(storageListeners).toHaveLength(1);
  await act(async () => root.render(null));
  expect(detach.mock.calls.filter(([name]) => name === "storage")).toEqual(storageListeners);
});

it("retains the legacy toggle export while refusing malformed fresh storage", async () => {
  const failed = vi.fn();
  function LegacyCaller() {
    const toggle = useToggleItinerary();
    return <button onClick={() => { try { toggle("legacy-event"); } catch (error) { failed(error); } }}>Legacy toggle</button>;
  }
  const unrelated = { id: "other-event", added_at: unrelatedAt };
  localStorage.setItem(itineraryKey, JSON.stringify([unrelated]));
  await act(async () => root.render(<LegacyCaller />));
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(JSON.parse(localStorage.getItem(itineraryKey)!)).toEqual([unrelated, { id: "legacy-event", added_at: expect.any(String) }]);
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(JSON.parse(localStorage.getItem(itineraryKey)!)).toEqual([unrelated]);
  localStorage.setItem(itineraryKey, "{broken");
  const write = vi.spyOn(Storage.prototype, "setItem");
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(failed).toHaveBeenCalledWith(expect.any(Error));
  expect(write).not.toHaveBeenCalled();
  expect(localStorage.getItem(itineraryKey)).toBe("{broken");
});
