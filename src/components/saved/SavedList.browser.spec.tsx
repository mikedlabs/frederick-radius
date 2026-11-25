// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedRef } from "@/hooks/useSaved";

const mocks = vi.hoisted(() => ({
  setEventSaved: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/hooks/useSaved", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useSaved")>()),
  setEventSaved: mocks.setEventSaved,
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { SavedEventRefresh } from "./SavedList";

const row = (id: string, saved_at = "2026-11-18T15:00:00Z"): SavedRef => ({ type: "event", id, saved_at });
const REMOVE_ONE = "Remove from Saved: the event that is no longer listed";

describe("Saved events that are no longer listed can be acted on", () => {
  let container: HTMLDivElement;
  let root: Root;
  const retry = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks(); mocks.setEventSaved.mockReset();
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  async function render(view: ReactElement) { await act(async () => root.render(view)); }
  const notice = (missing: SavedRef[], unresolvedCount = 0, retrying = false) => (
    <>
      <h1 id="saved-page-heading" tabIndex={-1}>Saved</h1>
      <SavedEventRefresh missing={missing} unresolvedCount={unresolvedCount} onRetry={retry} retrying={retrying} />
    </>
  );
  function button(name: string) { return [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.getAttribute("aria-label") === name || item.textContent?.trim() === name)!; }

  it("removes an unlisted event through the device store and restores it from Undo", async () => {
    mocks.setEventSaved.mockResolvedValueOnce(false);
    await render(notice([row("gone-event")]));
    expect(container.textContent).toContain("1 saved event is no longer listed.");
    expect(container.textContent).toContain("which kept when you saved it (Nov 18) but not its name.");
    expect(button(REMOVE_ONE).textContent).toBe("Remove from Saved");
    await act(async () => button(REMOVE_ONE).click());
    expect(mocks.setEventSaved).toHaveBeenCalledWith("gone-event", false);
    expect(mocks.toast).toHaveBeenCalledWith("Removed from Saved · 1 unlisted event", { id: "save:event:gone-event", duration: 6000, action: { label: "Undo", onClick: expect.any(Function) } });
    expect(mocks.toast.error).not.toHaveBeenCalled();

    // The store has dropped the row, so the notice leaves with it.
    await render(notice([]));
    expect(container.querySelector('[role="status"]')).toBeNull();
    // Undo hands the store the row's own stamp, so the restored row still
    // reports the day the event was first saved.
    mocks.setEventSaved.mockResolvedValueOnce(true);
    await act(async () => mocks.toast.mock.calls[0][1].action.onClick());
    expect(mocks.setEventSaved).toHaveBeenLastCalledWith("gone-event", true, "2026-11-18T15:00:00Z");
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("keeps the row and reports a removal the device refuses", async () => {
    mocks.setEventSaved.mockRejectedValueOnce(new Error("Unavailable"));
    await render(notice([row("refused-event")]));
    await act(async () => button(REMOVE_ONE).click());
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not remove from Saved", expect.objectContaining({ duration: 8000 }));
    expect(button(REMOVE_ONE).disabled).toBe(false);
  });

  it("does not report a removal the store did not confirm", async () => {
    mocks.setEventSaved.mockResolvedValueOnce(true);
    await render(notice([row("still-saved-event")]));
    await act(async () => button(REMOVE_ONE).click());
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not remove from Saved", expect.any(Object));
  });

  it("holds one pending removal and ignores a second press", async () => {
    let complete!: (saved: boolean) => void;
    mocks.setEventSaved.mockReturnValue(new Promise<boolean>((resolve) => { complete = resolve; }));
    await render(notice([row("pending-event")]));
    const remove = button(REMOVE_ONE);
    await act(async () => remove.click());
    expect(remove.disabled).toBe(true);
    expect(remove.getAttribute("aria-busy")).toBe("true");
    expect(remove.textContent).toBe("Removing…");
    expect(remove.getAttribute("aria-label")).toBe("Removing: the event that is no longer listed");
    await act(async () => remove.click());
    expect(mocks.setEventSaved).toHaveBeenCalledOnce();
    await act(async () => complete(false));
    expect(remove.disabled).toBe(false);
  });

  it("removes every unlisted row under one Undo that restores them all", async () => {
    mocks.setEventSaved.mockResolvedValue(false);
    await render(notice([row("first-gone", "2026-11-12T15:00:00Z"), row("second-gone", "2026-11-20T15:00:00Z")]));
    expect(container.textContent).toContain("2 saved events are no longer listed.");
    expect(container.textContent).toContain("which kept when you saved them (Nov 12 to Nov 20) but not their names.");
    await act(async () => button("Remove from Saved: the 2 events that are no longer listed").click());
    expect(mocks.setEventSaved.mock.calls).toEqual([["first-gone", false], ["second-gone", false]]);
    expect(mocks.toast).toHaveBeenCalledWith("Removed from Saved · 2 unlisted events", { duration: 6000, action: { label: "Undo", onClick: expect.any(Function) } });
    mocks.setEventSaved.mockReset(); mocks.setEventSaved.mockResolvedValue(true);
    await act(async () => mocks.toast.mock.calls[0][1].action.onClick());
    expect(mocks.setEventSaved.mock.calls).toEqual([["first-gone", true, "2026-11-12T15:00:00Z"], ["second-gone", true, "2026-11-20T15:00:00Z"]]);
  });

  it("reports an Undo the device refuses, with a retry", async () => {
    mocks.setEventSaved.mockResolvedValueOnce(false);
    await render(notice([row("undo-refused-event")]));
    await act(async () => button(REMOVE_ONE).click());
    mocks.setEventSaved.mockRejectedValueOnce(new Error("Unavailable"));
    await act(async () => mocks.toast.mock.calls[0][1].action.onClick());
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not undo this change", expect.objectContaining({ duration: 8000, action: expect.objectContaining({ label: "Try again" }) }));
  });

  it("moves keyboard focus to the Saved heading when the notice leaves", async () => {
    mocks.setEventSaved.mockResolvedValueOnce(false);
    await render(notice([row("focused-event")]));
    const remove = button(REMOVE_ONE);
    remove.focus();
    await act(async () => { remove.click(); });
    await act(async () => { root.render(notice([])); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(document.activeElement).toBe(container.querySelector("#saved-page-heading"));
  });

  it("keeps focus beside the notice while the Upcoming section remains", async () => {
    mocks.setEventSaved.mockResolvedValueOnce(false);
    const inSection = (missing: SavedRef[]) => (
      <>
        <h1 id="saved-page-heading" tabIndex={-1}>Saved</h1>
        <section><h2 id="saved-upcoming-heading" tabIndex={-1}>Upcoming</h2>
          <SavedEventRefresh missing={missing} unresolvedCount={0} onRetry={retry} retrying={false} />
        </section>
      </>
    );
    await render(inSection([row("nearby-event")]));
    const remove = button(REMOVE_ONE);
    remove.focus();
    await act(async () => { remove.click(); });
    await act(async () => { root.render(inSection([])); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(document.activeElement).toBe(container.querySelector("#saved-upcoming-heading"));
  });

  it("asks again for events that could not be refreshed", async () => {
    await render(notice([], 2));
    expect(container.textContent).toContain("We could not refresh 2 saved events right now. They are still saved.");
    await act(async () => button("Try again: saved events").click());
    expect(retry).toHaveBeenCalledOnce();
    await render(notice([], 2, true));
    expect(button("Trying again: saved events").disabled).toBe(true);
    expect(button("Trying again: saved events").textContent).toBe("Trying again…");
    expect(mocks.setEventSaved).not.toHaveBeenCalled();
  });
});
