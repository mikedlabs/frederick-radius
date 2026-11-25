// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getHomeMuni, getCommunityNotes, setCommunityNotes, setHomeMuni } from "@/lib/personalize";
import PreferencesPanel from "./PreferencesPanel";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/components/pwa/KeepRadiusCard", () => ({ default: () => null }));
vi.mock("@/components/settings/PhoneFeedbackCard", () => ({ default: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLElement;
let root: Root;
beforeEach(async () => {
  localStorage.clear();
  setHomeMuni("urbana");
  replace.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<PreferencesPanel />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function button(label: string) {
  const item = Array.from(host.querySelectorAll("button")).find((button) => button.textContent === label);
  if (!item) throw new Error(`Missing button: ${label}`);
  return item;
}

describe("Settings preferences", () => {
  it("closes the home picker from its trigger or a choice without changing the saved area", async () => {
    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Home area"] button')!;
    for (const focusChoice of [false, true]) {
      await act(async () => trigger.click());
      const focused = focusChoice ? button("Brunswick") : trigger;
      focused.focus();
      await act(async () => focused.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(trigger);
      expect(getHomeMuni()).toBe("urbana");
    }
    await act(async () => trigger.click());
    const choice = button("Brunswick");
    choice.focus();
    await act(async () => choice.click());
    expect(document.activeElement).toBe(trigger);
    expect(trigger.textContent).toContain("Brunswick");
    expect(getHomeMuni()).toBe("brunswick");
  });

  it("confirms the welcome setup reset and keeps unrelated preferences", async () => {
    setCommunityNotes(false);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const restart = button("Restart welcome setup");
    await act(async () => restart.click());
    expect(confirm.mock.calls[0][0]).toContain("home area, interests and preferences under What fits");
    expect(getHomeMuni()).toBe("urbana");
    expect(replace).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => restart.click());
    expect(getHomeMuni()).toBeNull();
    expect(getCommunityNotes()).toBe(false);
    expect(replace).toHaveBeenCalledWith("/welcome");
  });
});
