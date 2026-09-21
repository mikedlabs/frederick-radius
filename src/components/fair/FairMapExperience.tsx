"use client";

import { ExternalLink, MapPinned, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { greatFrederickFair2026Vendors } from "@/data/fair/great-frederick-fair-2026-vendors";
import { FAIR_LAYOUT_GUIDE_URL, FAIR_LAYOUT_URL, findFairLayoutBooth, parseFairLayoutData, type FairLayoutData } from "@/lib/fair/layout";
import { FAIR_BOOTH_SELECTION_HISTORY_KEY, FAIR_LAYOUT_NAVIGATION_EVENT, clearFairLayoutParams, fairBoothSelectionHasBackEntry, fairBoothShareUrl, readFairLayoutRoute, type FairLayoutRoute } from "@/lib/fair/layout-navigation";
import { FAIR_MAP_SELECTION_HISTORY_KEY, withoutFairMapSelectionHistoryState } from "@/lib/fair/map-selection-history";

import FairGroundsMap from "./FairGroundsMap";
import type { FairGroundsMapProps } from "./FairGroundsMapInner";

const FairBoothExplorer = dynamic(() => import("./FairBoothExplorer"), {
  loading: () => <p className="px-4 py-8 text-[14px] text-[var(--app-ink-2)]" role="status">Opening the booth layout…</p>,
});

function subscribeToRoute(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener("hashchange", callback);
  window.addEventListener(FAIR_LAYOUT_NAVIGATION_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener("hashchange", callback);
    window.removeEventListener(FAIR_LAYOUT_NAVIGATION_EVENT, callback);
  };
}
const readLocation = () => window.location.href;
const serverLocation = () => "https://frederickradius.app/moments/great-frederick-fair-2026#fair-map";

export default function FairMapExperience(props: FairGroundsMapProps) {
  const href = useSyncExternalStore(subscribeToRoute, readLocation, serverLocation);
  const route = readFairLayoutRoute(href);
  const [data, setData] = useState<FairLayoutData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const [manualShare, setManualShare] = useState<string | null>(null);
  const [groundsQuery, setGroundsQuery] = useState("");
  const pendingVendorRef = useRef<string | null>(null);

  useEffect(() => {
    if (data) return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => controller.abort(), 12_000);
    fetch(FAIR_LAYOUT_URL, { signal: controller.signal, credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok || Number(response.headers.get("content-length")) > 1_000_000) throw new Error("Layout unavailable");
        const body = await response.text();
        if (body.length > 1_000_000) throw new Error("Layout exceeds the reviewed size");
        return parseFairLayoutData(JSON.parse(body));
      })
      .then((layout) => {
        if (!active) return;
        const vendor = layout.vendors.find((item) => item.richProfileId === pendingVendorRef.current || item.id === pendingVendorRef.current);
        const selected = vendor ? findFairLayoutBooth(layout, vendor.boothIds[0]) : undefined;
        if (selected && readFairLayoutRoute(window.location.href).view === "booths") {
          const url = new URL(window.location.href);
          url.searchParams.set("floor", selected.map.id);
          url.searchParams.set("booth", selected.booth.id);
          window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
          window.dispatchEvent(new Event(FAIR_LAYOUT_NAVIGATION_EVENT));
        }
        pendingVendorRef.current = null;
        setData(layout);
        setStatus("ready");
      })
      .catch(() => { if (active) setStatus("failed"); })
      .finally(() => window.clearTimeout(timer));
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [attempt, data]);

  function navigate(next: FairLayoutRoute, kind: "push" | "replace" = "push", selection = false) {
    pendingVendorRef.current = null;
    const url = new URL(window.location.href);
    clearFairLayoutParams(url);
    url.searchParams.delete("vendor");
    url.searchParams.delete("meet");
    if (next.view === "booths") {
      url.searchParams.set("layout", "booths");
      url.searchParams.set("floor", next.floor);
      if (next.booth) url.searchParams.set("booth", next.booth);
      if (next.query) url.searchParams.set("bq", next.query.slice(0, 120));
    }
    url.hash = "fair-map";
    const historyState = withoutFairMapSelectionHistoryState(window.history.state);
    delete historyState[FAIR_BOOTH_SELECTION_HISTORY_KEY];
    if (selection) historyState[FAIR_BOOTH_SELECTION_HISTORY_KEY] = true;
    window.history[kind === "push" ? "pushState" : "replaceState"](historyState, "", `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new Event(FAIR_LAYOUT_NAVIGATION_EVENT));
    setManualShare(null);
  }

  const closeSelection = () => {
    if (window.history.state?.[FAIR_BOOTH_SELECTION_HISTORY_KEY]) window.history.back();
    else navigate({ ...route, booth: null }, "replace");
  };

  const selectBooth = (id: string | null) => {
    if (!id) { closeSelection(); return; }
    const selected = data ? findFairLayoutBooth(data, id) : null;
    if (!selected) return;
    navigate({ ...route, floor: selected.map.id, booth: id }, route.booth ? "replace" : "push", fairBoothSelectionHasBackEntry(route.booth, window.history.state));
  };

  const openVendor = (vendorId: string) => {
    const url = new URL(window.location.href);
    clearFairLayoutParams(url);
    url.searchParams.set("vendor", vendorId);
    url.searchParams.delete("meet");
    url.hash = "fair-map";
    const state = withoutFairMapSelectionHistoryState(window.history.state);
    delete state[FAIR_BOOTH_SELECTION_HISTORY_KEY];
    state[FAIR_MAP_SELECTION_HISTORY_KEY] = true;
    window.history.pushState(state, "", `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new Event(FAIR_LAYOUT_NAVIGATION_EVENT));
  };

  const showVendorBooths = (vendorId: string) => {
    const vendor = greatFrederickFair2026Vendors.find((item) => item.id === vendorId);
    const mappedVendor = data?.vendors.find((item) => item.richProfileId === vendorId || item.id === vendorId);
    const mappedBooth = data ? findFairLayoutBooth(data, mappedVendor?.boothIds[0] ?? vendorId) : undefined;
    navigate({ view: "booths", floor: mappedBooth?.map.id ?? "9566", booth: mappedBooth?.booth.id ?? null, query: mappedVendor?.name ?? vendor?.name ?? mappedBooth?.booth.label ?? "" });
    if (!data) pendingVendorRef.current = vendorId;
  };

  const shareBooth = async (id: string) => {
    const selected = data ? findFairLayoutBooth(data, id) : null;
    if (!selected) return;
    const url = fairBoothShareUrl(window.location.origin, selected.map.id, id);
    if (navigator.share) {
      try { await navigator.share({ title: `Booth ${selected.booth.label} at the Great Frederick Fair`, url }); return; }
      catch (error) { if ((error as { name?: string })?.name === "AbortError") return; }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      toast.success("Booth link copied.");
    } catch { setManualShare(url); }
  };

  const requestedBooth = data && route.booth ? findFairLayoutBooth(data, route.booth) : null;
  const requestedFloor = data?.maps.find((map) => map.id === route.floor);
  const mapId = requestedBooth?.map.id ?? requestedFloor?.id ?? data?.maps[0]?.id ?? route.floor;

  return <div data-fair-map-experience>
    {route.view === "booths" && !data ? <div className="mb-3 flex flex-wrap gap-2 px-4 lg:px-0" role="group" aria-label="Fair map views">
      <button type="button" onClick={() => navigate({ ...route, view: "grounds", booth: null })} className="tap-44 inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-3 text-[13px] font-bold text-[var(--app-cool)]"><MapPinned className="h-4 w-4" aria-hidden />Grounds & services</button>
    </div> : null}
    {route.view === "grounds" ? <FairGroundsMap {...props} boothLayoutData={data} initialSearchQuery={groundsQuery} onSearchQueryChange={setGroundsQuery} onShowBoothLayout={showVendorBooths} onBrowseBoothLayout={() => navigate({ view: "booths", floor: "9566", booth: null, query: "" })} /> : <div id="fair-map">
      <h1 id="fair-grounds-map-heading" tabIndex={-1} className="sr-only">Fairgrounds map</h1>
      {status === "failed" ? <section data-fair-booth-layout-fallback className="mx-4 rounded-[var(--app-radius-lg)] border border-[var(--app-border)] p-5 lg:mx-0" aria-labelledby="fair-layout-failure-heading">
        <h2 id="fair-layout-failure-heading" className="text-[24px] font-bold">The booth layout could not load.</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--app-ink-2)]">Try again or use the Fair’s official map. The grounds and services map is also available.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3"><Button onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }} iconLeft={<RefreshCw className="h-4 w-4" aria-hidden />}>Try loading the layout again</Button><a href={FAIR_LAYOUT_GUIDE_URL} target="_blank" rel="noopener noreferrer" className="tap-44 inline-flex min-h-11 items-center gap-2 text-[14px] font-bold text-[var(--app-cool)]">Open official Fair map<ExternalLink className="h-4 w-4" aria-hidden /></a></div>
      </section> : data ? <>
        {route.booth && !requestedBooth ? <p className="mx-4 mb-3 text-[14px] text-[var(--app-ink-2)]" role="status">That shared booth is not in this reviewed layout. Search for its vendor or choose a section.</p> : null}
        <FairBoothExplorer data={data} mapId={mapId} selectedBoothId={requestedBooth?.booth.id ?? null} query={route.query} onMapChange={(floor) => navigate({ ...route, floor, booth: null })} onSelectBooth={selectBooth} onQueryChange={(query) => navigate({ ...route, query, booth: null }, "replace")} onOpenVendor={openVendor} onShareBooth={shareBooth} onShowWholeFair={() => navigate({ ...route, view: "grounds", booth: null })} />
      </> : <p className="px-4 py-8 text-[14px] text-[var(--app-ink-2)]" role="status">Loading the reviewed booth layout…</p>}
      {manualShare ? <div className="mx-4 mt-4 rounded-[var(--app-radius-md)] border border-[var(--app-border)] p-4" role="status"><label htmlFor="fair-booth-share-link" className="text-[14px] font-semibold">Copy this booth link</label><input id="fair-booth-share-link" readOnly value={manualShare} onFocus={(event) => event.currentTarget.select()} className="mt-2 h-11 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-control-border)] bg-[var(--app-bg-elevated-solid)] px-3 text-[14px]" /></div> : null}
    </div>}
  </div>;
}
