// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelPrimaryTabResume, preparePrimaryTabResume, rememberPrimaryTab } from "@/lib/primary-tab-session";
import { useMapTabResumeQuery } from "./useMapTabResumeQuery";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const href = "/map?in=frederick&c=-77.4%2C39.4%2C13&layers=parks";
let root: Root, host: HTMLElement;
function Fixture() { const query = useMapTabResumeQuery(true); return <span>{query ?? "no-resume"}</span>; }
beforeEach(() => {
  sessionStorage.clear(); cancelPrimaryTabResume();
  history.replaceState({ retained: "history-owner" }, "", href);
  rememberPrimaryTab(`${href}&q=coffee`, 0);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); sessionStorage.clear(); cancelPrimaryTabResume(); });
describe("one-time Map tab query handoff", () => {
  it("commits one admitted query before passive synchronization and keeps camera/layers/history ownership", async () => {
    preparePrimaryTabResume("/map");
    const replace = vi.spyOn(history, "replaceState");
    await act(async () => root.render(<StrictMode><Fixture /></StrictMode>));
    expect(host.textContent).toBe("coffee"); expect(replace).toHaveBeenCalledTimes(1);
    expect(new URL(location.href).searchParams.get("q")).toBe("coffee");
    expect(new URL(location.href).searchParams.get("c")).toBe("-77.4,39.4,13");
    expect(new URL(location.href).searchParams.get("layers")).toBe("parks");
    expect(history.state.retained).toBe("history-owner");
    history.replaceState({}, "", `${href}&q=`); replace.mockClear();
    await act(async () => root.render(<StrictMode><Fixture /></StrictMode>));
    expect(replace).not.toHaveBeenCalled(); expect(new URL(location.href).searchParams.get("q")).toBe("");
  });
  it.each(["tea", ""])("preserves explicit URL q=%s even while an older tab handoff is available", async q => {
    preparePrimaryTabResume("/map"); history.replaceState({}, "", `${href}&q=${q}`);
    const replace = vi.spyOn(history, "replaceState"); await act(async () => root.render(<StrictMode><Fixture /></StrictMode>));
    expect(host.textContent).toBe("no-resume"); expect(replace).not.toHaveBeenCalled();
    expect(new URL(location.href).searchParams.get("q")).toBe(q);
  });
  it("does not use an old saved search for an ordinary direct map arrival", async () => {
    const replace = vi.spyOn(history, "replaceState"); await act(async () => root.render(<Fixture />));
    expect(host.textContent).toBe("no-resume"); expect(replace).not.toHaveBeenCalled();
  });
});
