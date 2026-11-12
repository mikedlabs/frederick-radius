// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";

const liveContext = vi.hoisted(() => vi.fn(() => null));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/components/ui/BottomSheet", () => ({
  default: ({ children, onClose }: { children: (dismiss: () => void) => ReactNode; onClose: () => void }) => <div role="dialog">{children(onClose)}</div>,
  SheetHandle: () => null,
}));
vi.mock("@/components/saved/SaveButton", () => ({ default: () => null }));
vi.mock("./ShareButton", () => ({ default: () => null }));
vi.mock("./SourceBadge", () => ({ default: () => null }));
vi.mock("./FieldNotesCard", () => ({ default: () => null }));
vi.mock("./GooglePlaceContext", () => ({ default: liveContext }));
vi.mock("@/components/plan/PlanFromPlaceLink", () => ({ default: () => null }));
vi.mock("@/lib/aerial", () => ({ nearestAerial: () => null, currentSeason: () => "autumn" }));
vi.mock("@/lib/cuisine", () => ({ knownFor: () => null }));
vi.mock("@/lib/decision/telemetry", () => ({ decisionContextFromPath: () => ({ surface: "map" }), trackDecision: () => {} }));

import PlaceSheet from "./PlaceSheet";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const pin = {
  slug: "pending-place", name: "Known place", category: "restaurant", municipality: "frederick",
  geom: { lng: -77.4, lat: 39.4 }, open_status: { state: "unknown" },
} as PlaceCardData;

describe("partial map place metadata", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.history.replaceState({}, "", "/map?place=pending-place&c=-77.4,39.4,14");
    liveContext.mockClear();
    fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith("/events") ? { events: [] } : null }));
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");document.body.append(container);root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount());container.remove();vi.unstubAllGlobals(); });
  async function render(metadataPending: boolean, place = pin, metadataUnavailable = false) {
    await act(async () => root.render(<PlaceSheet place={place} metadataPending={metadataPending} metadataUnavailable={metadataUnavailable} historyLayerId="one-place-layer" onClose={() => {}} />));
  }

  it("shows the known name without treating the pending pin as a missing-enrichment record", async () => {
    await render(true);
    expect(container.querySelector("h2")?.textContent).toBe("Known place");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Loading place details…");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(liveContext).not.toHaveBeenCalled();
    await render(false, { ...pin, website: "https://example.org/" });
    expect(container.textContent).not.toContain("Loading place details…");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/enrich"))).toEqual([]);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/place/pending-place/events");
    expect(liveContext).toHaveBeenCalled();
  });

  it("allows the existing basic enrichment only after the authoritative record confirms that gap", async () => {
    await render(true);
    expect(fetchMock).not.toHaveBeenCalled();
    await render(false);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/enrich")))
      .toEqual([["/api/place/pending-place/enrich?mode=basic", { cache: "no-store" }]]);
    await render(false);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/enrich"))).toHaveLength(1);
  });

  it("keeps an unavailable pin usable without treating failure as permission to enrich", async () => {
    await render(true);
    await render(false, pin, true);
    expect(container.querySelector("h2")?.textContent).toBe("Known place");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("More details are unavailable. You can keep browsing or open the full page.");
    expect(container.textContent).not.toContain("Loading place details…");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(liveContext).not.toHaveBeenCalled();
    const fullPage = [...container.querySelectorAll("a")].find(link => link.textContent?.includes("See full page"));
    expect(fullPage?.getAttribute("href")).toContain("/places/pending-place?returnTo=");
    expect(container.querySelector('a[href^="https://maps.apple.com/"]')).not.toBeNull();
  });
});
