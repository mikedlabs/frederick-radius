"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowLeft, ArrowUpRight, ChevronRight, Expand, List, Minus, Plus, Search, Share2, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import type { FairLayoutData } from "@/lib/fair/layout";
import { fairBoothMapContexts, findFairBoothNeighborhood } from "@/data/fair/fair-booth-context";

import { boothViewBox, fitBoothCamera, focusBoothCamera, MAX_BOOTH_ZOOM, panBoothCamera, zoomBoothCamera, type BoothCamera, type BoothCanvas } from "./fair-booth-camera";
import { layoutFairVendorLabels } from "./fair-booth-vendor-labels";
import styles from "./FairBoothExplorer.module.css";

type LayoutMap = FairLayoutData["maps"][number];
type LayoutBooth = LayoutMap["booths"][number];
type BoothResult = { map: LayoutMap; booth: LayoutBooth; names: string[] };

export type FairBoothExplorerProps = {
  data: FairLayoutData;
  mapId: string;
  selectedBoothId: string | null;
  query: string;
  onMapChange: (mapId: string) => void;
  onSelectBooth: (boothId: string | null) => void;
  onQueryChange: (query: string) => void;
  onOpenVendor?: (richProfileId: string) => void;
  onShareBooth?: (boothId: string) => void;
  onShowWholeFair?: () => void;
};

function normalized(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function boothName(booth: LayoutBooth) {
  return booth.label ? `Booth ${booth.label}` : "Unlabeled space";
}

function boothTransform(booth: LayoutBooth) {
  return booth.rotationDeg ? `rotate(${booth.rotationDeg} ${booth.x} ${booth.y})` : undefined;
}

export function findBoothResults(data: FairLayoutData, query: string): BoothResult[] {
  const terms = normalized(query).split(" ").filter((term) => term && term !== "booth" && term !== "booths");
  const vendors = new Map(data.vendors.map((vendor) => [vendor.id, vendor]));
  return data.maps.flatMap((map) => map.booths.flatMap((booth) => {
    const names = booth.vendorIds.flatMap((id) => vendors.get(id)?.name ?? []);
    const text = normalized([booth.label, ...names].join(" "));
    return terms.every((term) => terms.length === 1 && /^\d+$/.test(term) ? normalized(booth.label) === term : text.includes(term))
      ? [{ map, booth, names }]
      : [];
  })).sort((a, b) => a.booth.label.localeCompare(b.booth.label, undefined, { numeric: true }));
}

function checkedLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "The source check time is unavailable.";
  return `Layout checked ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }).format(date)}.`;
}

type PointerPosition = { x: number; y: number; startX: number; startY: number; boothId: string | null };

export default function FairBoothExplorer({ data, mapId, selectedBoothId, query, onMapChange, onSelectBooth, onQueryChange, onOpenVendor, onShareBooth, onShowWholeFair }: FairBoothExplorerProps) {
  const activeMap = data.maps.find((map) => map.id === mapId) ?? data.maps[0];
  const [cameras, setCameras] = useState<Record<string, BoothCamera>>({});
  const [showOriginal, setShowOriginal] = useState(false);
  const [neighborhoods, setNeighborhoods] = useState<Record<string, string>>({});
  const context = activeMap ? fairBoothMapContexts[activeMap.id] : undefined;
  const areaOptions = useMemo(() => data.maps.flatMap((map) => fairBoothMapContexts[map.id]?.neighborhoods ?? [{ id: `map-${map.id}`, mapId: map.id, name: map.name, bounds: { x: 0, y: 0, width: map.width, height: map.height }, boothIds: map.booths.map((booth) => booth.id) }]), [data]);
  const [viewport, setViewport] = useState({ width: 800, height: 560, measured: false });
  const [showList, setShowList] = useState(false);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const originRef = useRef<HTMLElement | null>(null);
  const lastSelectionRef = useRef<string | null>(null);
  const pointersRef = useRef(new Map<number, PointerPosition>());
  const gestureMovedRef = useRef(false);
  const pinchRef = useRef<{ distance: number; midpoint: { x: number; y: number }; camera: BoothCamera } | null>(null);
  const id = useId();
  const allResults = useMemo(() => findBoothResults(data, ""), [data]);
  const results = useMemo(() => findBoothResults(data, query), [data, query]);
  const hasQuery = query.trim().length > 0;
  const highlighted = useMemo(() => new Set(hasQuery ? results.map(({ booth }) => booth.id) : []), [hasQuery, results]);
  const selected = allResults.find(({ booth }) => booth.id === selectedBoothId);
  const selectedNeighborhood = selected ? findFairBoothNeighborhood(selected.booth.id) : undefined;
  const neighborhoodId = selected?.map.id === activeMap?.id && selectedNeighborhood ? selectedNeighborhood.id : (activeMap ? neighborhoods[activeMap.id] : undefined) ?? (activeMap?.id === "9566" ? "west-end" : undefined);
  const activeNeighborhood = areaOptions.find((area) => area.mapId === activeMap?.id && area.id === neighborhoodId) ?? areaOptions.find((area) => area.mapId === activeMap?.id);
  const canvasBounds: BoothCanvas | undefined = showOriginal ? activeMap : activeNeighborhood?.bounds ?? activeMap;
  const cameraKey = `${activeMap?.id ?? "none"}:${showOriginal ? "original" : activeNeighborhood?.id ?? "radius"}`;
  const selectionKey = viewport.measured && selected?.map.id === activeMap?.id ? `${selected?.booth.id}:${cameraKey}` : null;
  const [focusedBoothId, setFocusedBoothId] = useState<string | null>(null);
  // Reconcile the controlled selection before painting. Query changes never
  // enter this branch, and closing details retains the person's camera.
  if (selectionKey !== focusedBoothId) {
    setFocusedBoothId(selectionKey);
    if (selected && canvasBounds && selectionKey) {
      setCameras((previous) => ({ ...previous, [cameraKey]: focusBoothCamera(canvasBounds, viewport, selected.booth) }));
      if (activeMap && selectedNeighborhood) setNeighborhoods((previous) => ({ ...previous, [activeMap.id]: selectedNeighborhood.id }));
    }
  }
  const areaResults = allResults.filter(({ booth }) => activeNeighborhood?.boothIds.includes(booth.id));
  const listed = hasQuery ? results : areaResults;
  const areaVendors = data.vendors.flatMap((vendor) => {
    const booths = areaResults.filter(({ booth }) => booth.vendorIds.includes(vendor.id));
    return booths.length ? [{ vendor, booths }] : [];
  }).sort((a, b) => Number(Boolean(b.vendor.richProfileId)) - Number(Boolean(a.vendor.richProfileId)) || a.vendor.name.localeCompare(b.vendor.name));
  const radPies = allResults.find(({ names }) => names.some((name) => /\brad\s*pies\b/i.test(name)));
  const camera = useMemo(() => canvasBounds ? cameras[cameraKey] ?? fitBoothCamera(canvasBounds) : { x: 0, y: 0, zoom: 1 }, [cameraKey, canvasBounds, cameras]);
  const cameraRef = useRef(camera);
  useEffect(() => { cameraRef.current = camera; }, [camera]);
  const viewBox = canvasBounds ? boothViewBox(canvasBounds, viewport, camera) : { x: 0, y: 0, width: 1, height: 1 };
  const vendorLabels = layoutFairVendorLabels({ booths: areaResults.map(({ booth }) => booth), vendors: data.vendors, viewBox, viewport, selectedBoothId, highlightedIds: highlighted });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setViewport((previous) => previous.measured && previous.width === rect.width && previous.height === rect.height ? previous : { width: rect.width, height: rect.height, measured: true });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!activeMap || selected?.map.id !== activeMap.id) {
      if (!selectedBoothId && lastSelectionRef.current) {
        const origin = originRef.current;
        (origin?.isConnected ? origin : searchRef.current)?.focus({ preventScroll: true });
        lastSelectionRef.current = null;
      }
      return;
    }
    if (lastSelectionRef.current === selected.booth.id) return;
    lastSelectionRef.current = selected.booth.id;
    detailHeadingRef.current?.focus({ preventScroll: true });
  }, [activeMap, selected, selectedBoothId, viewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasBounds) return;
    const wheel = (event: WheelEvent) => {
      // Ordinary page scrolling stays available. Ctrl/trackpad pinch is an
      // explicit map gesture; the visible controls work with every mouse.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      setCameras((previous) => ({ ...previous, [cameraKey]: zoomBoothCamera(canvasBounds, viewport, previous[cameraKey] ?? fitBoothCamera(canvasBounds), Math.exp(-event.deltaY * 0.008), { x: event.clientX - bounds.left, y: event.clientY - bounds.top }) }));
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, [cameraKey, canvasBounds, viewport]);

  if (!activeMap || !canvasBounds) return <p>The Fair layout is unavailable. Open the official guide for booth information.</p>;

  const setCamera = (next: BoothCamera) => {
    cameraRef.current = next;
    setCameras((previous) => ({ ...previous, [cameraKey]: next }));
  };
  const fitSection = () => {
    setCamera(fitBoothCamera(canvasBounds));
  };
  const chooseNeighborhood = (areaId: string) => {
    const area = areaOptions.find((item) => item.id === areaId);
    if (!area) return;
    setNeighborhoods((previous) => ({ ...previous, [area.mapId]: areaId }));
    setShowOriginal(false);
    onSelectBooth(null);
    setCameras((previous) => ({ ...previous, [`${area.mapId}:${area.id}`]: fitBoothCamera(area.bounds) }));
    if (area.mapId !== activeMap.id) onMapChange(area.mapId);
  };
  const selectBooth = (boothId: string, origin?: HTMLElement) => {
    originRef.current = origin ?? canvasRef.current;
    onSelectBooth(boothId);
  };
  const pointerPosition = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const startPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const point = pointerPosition(event);
    const target = event.target instanceof Element ? event.target.closest("[data-fair-booth-id], [data-fair-booth-label-for]") : null;
    pointersRef.current.set(event.pointerId, { ...point, startX: point.x, startY: point.y, boothId: target?.getAttribute("data-fair-booth-id") ?? target?.getAttribute("data-fair-booth-label-for") ?? null });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (pointersRef.current.size === 1) gestureMovedRef.current = false;
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, camera: cameraRef.current };
      gestureMovedRef.current = true;
    }
  };
  const movePointer = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointersRef.current.get(event.pointerId);
    if (!previous) return;
    const point = pointerPosition(event);
    pointersRef.current.set(event.pointerId, { ...previous, ...point });
    if (Math.hypot(point.x - previous.startX, point.y - previous.startY) > 5) gestureMovedRef.current = true;
    const positions = [...pointersRef.current.values()];
    if (positions.length >= 2 && pinchRef.current) {
      const [a, b] = positions;
      const pinch = pinchRef.current;
      const zoomed = zoomBoothCamera(canvasBounds, viewport, pinch.camera, Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance, pinch.midpoint);
      setCamera(panBoothCamera(canvasBounds, viewport, zoomed, (a.x + b.x) / 2 - pinch.midpoint.x, (a.y + b.y) / 2 - pinch.midpoint.y));
    } else if (gestureMovedRef.current) {
      setCamera(panBoothCamera(canvasBounds, viewport, cameraRef.current, point.x - previous.x, point.y - previous.y));
    }
  };
  const endPointer = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const pointer = pointersRef.current.get(event.pointerId);
    if (!cancelled && !gestureMovedRef.current && pointer?.boothId) selectBooth(pointer.boothId);
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const keyCamera = (event: KeyboardEvent<HTMLDivElement>) => {
    const directions: Record<string, [number, number]> = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] };
    if (directions[event.key]) {
      event.preventDefault();
      setCamera(panBoothCamera(canvasBounds, viewport, camera, ...directions[event.key]));
    } else if (["+", "=", "-", "_"].includes(event.key)) {
      event.preventDefault();
      setCamera(zoomBoothCamera(canvasBounds, viewport, camera, ["+", "="].includes(event.key) ? 1.5 : 1 / 1.5));
    } else if (event.key === "Home" || event.key === "0") {
      event.preventDefault();
      fitSection();
    } else if (event.key === "Escape" && selectedBoothId) {
      event.preventDefault();
      onSelectBooth(null);
    }
  };

  return (
    <section data-fair-booth-explorer className={styles.explorer} aria-label="Fair booth finder">
      {onShowWholeFair && <Button variant="quiet" className={styles.wholeFair} iconLeft={<ArrowLeft size={16} aria-hidden />} onClick={onShowWholeFair}>Whole fair</Button>}
      <div className={styles.workspace}>
        <div className={styles.mapColumn}>
          <div className={styles.contextToolbar}>
            <div className={styles.neighborhoodField}><label htmlFor={`${id}-neighborhood`}>Booth area <span>{areaOptions.length} areas</span></label><select id={`${id}-neighborhood`} aria-label="Choose a booth area" value={activeNeighborhood?.id} onChange={(event) => chooseNeighborhood(event.target.value)}>{areaOptions.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></div>
          </div>
          <div className={styles.mapFrame}>
            <div ref={canvasRef} data-fair-booth-canvas data-layout-style={showOriginal ? "original" : "radius"} data-booth-area={activeNeighborhood?.id} data-zoom={camera.zoom.toFixed(3)} tabIndex={0} role="group" aria-label={`${showOriginal ? activeMap.name : activeNeighborhood?.name} booth layout`} aria-describedby={`${id}-instructions`} className={styles.canvas} onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={(event) => endPointer(event)} onPointerCancel={(event) => endPointer(event, true)} onKeyDown={keyCamera}>
              <svg data-fair-booth-svg aria-hidden="true" className={styles.floorplan} viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}>
                <defs><clipPath id={`${id}-area-clip`}><rect x={canvasBounds.x ?? 0} y={canvasBounds.y ?? 0} width={canvasBounds.width} height={canvasBounds.height} /></clipPath></defs>
                <g clipPath={showOriginal ? undefined : `url(#${id}-area-clip)`}>
                {showOriginal ? <image href={activeMap.backgroundUrl} x={0} y={0} width={activeMap.width} height={activeMap.width * activeMap.imageHeight / activeMap.imageWidth} onError={() => setFailedImages((previous) => previous.includes(activeMap.id) ? previous : [...previous, activeMap.id])} /> : <g data-fair-booth-context>{context?.paths.map((path) => <path key={path.id} data-fair-context={path.kind} d={path.d} className={styles.contextPath} vectorEffect="non-scaling-stroke" />)}{context?.labels.map((label, index) => <text key={`context-label-${index}`} className={styles.contextLabel} x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(30, Math.max(18, viewBox.width / viewport.width * 12))} transform={label.rotation ? `rotate(${label.rotation} ${label.x} ${label.y})` : undefined}>{label.text}</text>)}</g>}
                {activeMap.annotations?.filter((annotation) => annotation.fontSize > 0).map((annotation, index) => <text key={`annotation-${index}`} className={showOriginal ? styles.annotation : styles.contextLabel} x={annotation.x} y={annotation.y} dominantBaseline="text-before-edge" fontSize={showOriginal ? annotation.fontSize : viewBox.width / viewport.width * 12} transform={annotation.rotationDeg ? `rotate(${annotation.rotationDeg} ${annotation.x} ${annotation.y})` : undefined}>{annotation.text}</text>)}
                {activeMap.booths.map((booth) => {
                  const isSelected = booth.id === selectedBoothId;
                  const isMatch = highlighted.has(booth.id);
                  const names = data.vendors.filter((vendor) => booth.vendorIds.includes(vendor.id)).map((vendor) => vendor.name);
                  return <g key={booth.id} transform={boothTransform(booth)}><rect data-fair-booth-id={booth.id} data-vendor-listed={names.length > 0} data-highlighted={isMatch} data-selected={isSelected} className={styles.booth} x={booth.x} y={booth.y} width={booth.width} height={booth.height} rx={Math.min(2, booth.width * .05)} vectorEffect="non-scaling-stroke"><title>{`${boothName(booth)}: ${names.join(", ") || "No vendor listed"}`}</title></rect>{booth.label && <text className={styles.boothLabel} x={booth.x + booth.width / 2} y={booth.y + booth.height / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(booth.height * 0.46, booth.width / Math.max(2, booth.label.length) * 1.45)}>{booth.label}</text>}</g>;
                })}
                {activeMap.booths.filter((booth) => highlighted.has(booth.id) || booth.id === selectedBoothId).map((booth) => <rect key={`outline-${booth.id}`} className={styles.highlightOutline} data-selected={booth.id === selectedBoothId} x={booth.x} y={booth.y} width={booth.width} height={booth.height} transform={boothTransform(booth)} vectorEffect="non-scaling-stroke" />)}
                </g>
                {!showOriginal && <g transform={`translate(${viewBox.x} ${viewBox.y}) scale(${viewBox.width / viewport.width})`}>
                  {vendorLabels.map((label) => <g key={`leader-${label.vendorId}`} className={styles.vendorMapLabel} data-selected={label.selected}>
                    <line x1={label.anchorX} y1={label.anchorY} x2={Math.max(label.x + 8, Math.min(label.x + label.width - 8, label.anchorX))} y2={Math.max(label.y, Math.min(label.y + label.height, label.anchorY))} className={styles.vendorLeader} />
                    <circle cx={label.anchorX} cy={label.anchorY} r={3} className={styles.vendorAnchor} />
                  </g>)}
                  {vendorLabels.map((label) => <g key={label.vendorId} data-fair-vendor-label data-vendor-id={label.vendorId} data-fair-booth-label-for={label.boothId} data-selected={label.selected} className={styles.vendorMapLabel}>
                    <title>{label.name}, booth {label.boothLabel}</title>
                    <rect x={label.x} y={label.y} width={label.width} height={label.height} rx={6} className={styles.vendorLabelSurface} />
                    <text x={label.x + 10} y={label.y + 17} className={styles.vendorName}>{label.displayName}</text>
                    <text x={label.x + 10} y={label.y + 33} className={styles.vendorBoothNumber}>Booth {label.boothLabel}</text>
                  </g>)}
                </g>}
              </svg>
            </div>
            <div className={styles.mapReadout} aria-hidden="true">{selected ? <><strong data-fair-selected-vendor>{selected.names.join(", ") || boothName(selected.booth)}</strong><span>{selected.names.length ? `${boothName(selected.booth)} · ` : ""}{activeNeighborhood?.name ?? activeMap.shortName}</span></> : <><strong>{activeNeighborhood?.name ?? activeMap.shortName}</strong><span>{areaVendors.length} listed vendors</span></>}</div>
            <div className={styles.mapControls} role="group" aria-label="Map zoom controls">
              <Button variant="secondary" className={styles.iconButton} aria-label="Zoom in" disabled={camera.zoom >= MAX_BOOTH_ZOOM} onClick={() => setCamera(zoomBoothCamera(canvasBounds, viewport, camera, 1.5))}><Plus size={18} aria-hidden /></Button>
              <Button variant="secondary" className={styles.iconButton} aria-label="Zoom out" disabled={camera.zoom <= 1} onClick={() => setCamera(zoomBoothCamera(canvasBounds, viewport, camera, 1 / 1.5))}><Minus size={18} aria-hidden /></Button>
              <Button variant="secondary" className={styles.iconButton} aria-label="Fit booth area" onClick={fitSection}><Expand size={18} aria-hidden /></Button>
            </div>
          </div>
          <div className={styles.mapLegend} aria-label="Map key"><span><i data-vendor-listed="true" />Vendor listed</span><span><i />No vendor listed</span></div>
          <p id={`${id}-instructions`} className={styles.mapInstructions}>Drag to move. Pinch or use + and − to zoom. <span className="sr-only">With a mouse, hold Control while scrolling to zoom. With the map focused, use the arrow keys to move, plus or minus to zoom, and Home to fit the map. Choose a booth from the list for keyboard access.</span></p>
          <Button variant="quiet" className={styles.sourceToggle} aria-pressed={showOriginal} onClick={() => setShowOriginal((value) => !value)}>{showOriginal ? "Hide original layout" : "Show original layout"}</Button>
          {showOriginal && <p className={styles.originalContext}>This original sheet shows {activeMap.name}.</p>}
          {showOriginal && failedImages.includes(activeMap.id) && <p role="status" className={styles.imageError}>The official map image could not load. You can still find a vendor using the booth list.</p>}
          <p className={styles.source}><a href={data.provenance.guideUrl} target="_blank" rel="noopener noreferrer">Official Fair source <ArrowUpRight size={13} aria-hidden /></a><span>{checkedLabel(data.checkedAt)}</span><span>Booth positions follow the Fair’s layout. This is not a GPS map.</span></p>
        </div>

        <aside className={styles.sidebar} aria-label="Find and view booths" onKeyDown={(event) => { if (event.key === "Escape" && selectedBoothId) { event.preventDefault(); onSelectBooth(null); } }}>
          <div className={styles.searchSection}>
            <h3 className={styles.findHeading}>Find a vendor</h3>
            <label className={styles.searchBox}>
              <Search size={18} aria-hidden />
              <input ref={searchRef} type="search" value={query} aria-label="Find a vendor or booth" placeholder="Vendor or booth number" onChange={(event) => onQueryChange(event.target.value)} />
            </label>
            {!hasQuery && !selected && radPies && <Button variant="quiet" className={styles.quickFind} iconRight={<ChevronRight size={16} aria-hidden />} onClick={() => onQueryChange("Rad Pies")}>Find Rad Pies</Button>}
          </div>

          {selected ? (
            <section className={styles.detail} aria-label={boothName(selected.booth)}>
              <div className={styles.detailTop}><p className={styles.sectionLabel}>{selectedNeighborhood?.name ?? selected.map.shortName}</p><Button variant="quiet" className={styles.iconButton} aria-label="Close booth details" onClick={() => onSelectBooth(null)}><X size={19} aria-hidden /></Button></div>
              <h4 id="fair-booth-detail-heading" ref={detailHeadingRef} tabIndex={-1} className={styles.boothHeading}>{boothName(selected.booth)}</h4>
              {selected.booth.vendorIds.length ? selected.booth.vendorIds.map((vendorId) => {
                const vendor = data.vendors.find((item) => item.id === vendorId);
                if (!vendor) return null;
                return <div key={vendor.id} className={styles.vendorDetail}>
                  <h5>{vendor.name}</h5>
                  {vendor.boothIds.length > 1 && <div className={styles.relatedBooths}><p>Also listed at:</p><div>{allResults.filter(({ booth }) => vendor.boothIds.includes(booth.id) && booth.id !== selected.booth.id).map(({ booth }) => <button key={booth.id} type="button" aria-label={`Show booth ${booth.label}: ${vendor.name}`} onClick={(event) => selectBooth(booth.id, event.currentTarget)}>{booth.label}</button>)}</div></div>}
                  {vendor.richProfileId && onOpenVendor && <Button className={styles.detailAction} onClick={() => onOpenVendor(vendor.richProfileId!)}>View menu and details</Button>}
                  <a className={styles.profileLink} href={`https://mobile.map-dynamics.com/exhibitor-profile-g2app.php?ID=${encodeURIComponent(vendor.profileId)}`} target="_blank" rel="noopener noreferrer">Official vendor profile <ArrowUpRight size={15} aria-hidden /></a>
                </div>;
              }) : <p className={styles.bodyCopy}>{selected.booth.label ? "The official guide does not list a vendor for this booth." : "The official layout does not give this space a booth number or vendor."}</p>}
              <p className={styles.detailNote}>Booth listings do not confirm vendor hours or what is available today.</p>
              {onShareBooth && <Button variant="secondary" className={styles.shareButton} iconLeft={<Share2 size={15} aria-hidden />} onClick={() => onShareBooth(selected.booth.id)}>Share this booth</Button>}
            </section>
          ) : !hasQuery && !showList ? <div className={styles.browseIntro}>
            <div className={styles.resultsHeading}><h4>Vendors in this area</h4><span>{areaVendors.length} listed</span></div>
            {areaVendors.length ? <ul className={styles.areaVendorList} data-fair-area-vendors>{areaVendors.slice(0, 6).map(({ vendor, booths }) => <li key={vendor.id}><button type="button" className={styles.resultButton} aria-label={`Show booth ${booths[0].booth.label}: ${vendor.name}`} onClick={(event) => selectBooth(booths[0].booth.id, event.currentTarget)}><span className={styles.resultText}><strong>{vendor.name}</strong><span>Booth{booths.length > 1 ? "s" : ""} {booths.map(({ booth }) => booth.label).join(", ")}</span></span><ChevronRight size={15} aria-hidden /></button></li>)}</ul> : <p>The official guide does not list vendors in this area.</p>}
            <Button variant="secondary" className={styles.browseButton} iconLeft={<List size={16} aria-hidden />} onClick={() => setShowList(true)}>Browse booth list</Button>
            <p className={styles.areaHint}>Search finds vendors and booth numbers across all {areaOptions.length} areas.</p>
          </div> : null}

          {(hasQuery || showList) && <div className={styles.results}>
            <div className={styles.resultsHeading}><h4>{hasQuery ? "Matching booths" : "Booths in this area"}</h4><span role="status">{listed.length} {listed.length === 1 ? "match" : "matches"}</span></div>
            {listed.length ? <ul className={styles.resultList}>{listed.map(({ map, booth, names }) => <li key={booth.id}><button type="button" aria-label={`Show ${booth.label ? `booth ${booth.label}` : "unlabeled space"}: ${names.join(", ") || "No vendor listed"}`} aria-pressed={booth.id === selectedBoothId} className={styles.resultButton} onClick={(event) => selectBooth(booth.id, event.currentTarget)}><span className={styles.resultNumber}>{booth.label || "?"}</span><span className={styles.resultText}><strong>{names.join(", ") || (booth.label ? "No vendor listed" : "Unlabeled space")}</strong><span>{findFairBoothNeighborhood(booth.id)?.name ?? map.shortName}</span></span><ChevronRight size={15} aria-hidden /></button></li>)}</ul> : <p className={styles.bodyCopy}>No booths match “{query}”. Try a vendor name or a booth number.</p>}
            <Button variant="quiet" className={styles.resetSearch} onClick={() => { onQueryChange(""); setShowList(false); searchRef.current?.focus(); }}>{hasQuery ? "Clear search" : "Close booth list"}</Button>
          </div>}
        </aside>
      </div>
    </section>
  );
}
