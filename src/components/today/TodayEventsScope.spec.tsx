// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setScope } from "@/lib/scope";
import TodayEventsRecovery from "./TodayEventsRecovery";

const navigation = vi.hoisted(() => ({ query: "", suspend: false }));
vi.mock("next/navigation", () => ({ useSearchParams: () => { if (navigation.suspend) throw new Promise(() => undefined); return new URLSearchParams(navigation.query); } }));
const countyEvent = { slug: "county-fixture", title: "County fixture", venue: "County hall", municipality: "frederick", time: "7:00 PM", moment: "Tonight" as const, image: null, free: true };
const brunswickEvent = { ...countyEvent, slug: "brunswick-fixture", title: "Brunswick fixture", municipality: "brunswick", venue: "Brunswick hall" };
const countyResponse = { partial: false, events: [countyEvent] };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  navigation.query = "";
  navigation.suspend = false;
  setScope("county");
});
afterEach(() => { setScope("county"); vi.unstubAllGlobals(); });

it("uses the county server brief without repeating its read", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<TodayEventsRecovery scoped initialResponse={countyResponse} />));
    expect(container.textContent).toContain("County fixture");
    expect(fetchMock).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
});

it("replaces a county brief with the explicit town and keeps the board link in that town", async () => {
  navigation.query = "in=brunswick";
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ partial: false, events: [brunswickEvent] }) });
  vi.stubGlobal("fetch", fetchMock);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<TodayEventsRecovery scoped initialResponse={countyResponse} />));
    await vi.waitFor(() => expect(container.textContent).toContain("Brunswick fixture"));
    expect(container.textContent).not.toContain("County fixture");
    expect(container.textContent).toContain("Brunswick");
    expect(container.querySelector('a[href="/events?in=brunswick"]')).not.toBeNull();
    const url = new URL(fetchMock.mock.calls[0][0], "https://example.test");
    expect(url.searchParams.get("in")).toBe("brunswick");
    expect(url.searchParams.get("v")).toBe("visual-choices-1");
  } finally { await act(async () => root.unmount()); }
});

it("aborts a former town read and ignores its late response when scope changes", async () => {
  let release!: (value: unknown) => void;
  const late = new Promise(resolve => { release = resolve; });
  const fetchMock = vi.fn().mockImplementationOnce(() => late).mockResolvedValueOnce({ ok: true, json: async () => ({ partial: false, events: [brunswickEvent] }) });
  vi.stubGlobal("fetch", fetchMock);
  setScope("town:frederick");
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<TodayEventsRecovery scoped initialResponse={countyResponse} />));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const formerSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    await act(async () => setScope("town:brunswick"));
    await vi.waitFor(() => expect(container.textContent).toContain("Brunswick fixture"));
    expect(formerSignal.aborted).toBe(true);
    await act(async () => release({ ok: true, json: async () => countyResponse }));
    expect(container.textContent).not.toContain("County fixture");
    expect(container.querySelector('a[href="/events?in=brunswick"]')).not.toBeNull();
  } finally { await act(async () => root.unmount()); }
});

it("replaces the same-scope brief when a server refresh supplies a new response", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<TodayEventsRecovery scoped initialResponse={countyResponse} />));
    expect(container.textContent).toContain("County fixture");
    await act(async () => root.render(<TodayEventsRecovery scoped initialResponse={{ partial: false, events: [brunswickEvent] }} />));
    expect(container.textContent).toContain("Brunswick fixture");
    expect(container.textContent).not.toContain("County fixture");
    expect(fetchMock).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
});

it("keeps a truthful county brief in initial HTML while the URL hook waits for hydration", () => {
  navigation.suspend = true;
  const html = renderToString(<TodayEventsRecovery scoped initialResponse={countyResponse} />);
  expect(html).toContain('href="/events/county-fixture"');
  expect(html).toContain("County fixture");
  expect(html).toContain("Countywide");
  expect(html).not.toContain("Brunswick");
});
