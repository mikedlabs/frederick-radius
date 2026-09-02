"use client";

import {
  Building2,
  CircleParking,
  DoorOpen,
  ExternalLink,
  LocateFixed,
  MapPin,
  MessageSquareWarning,
  Megaphone,
  PawPrint,
  Scan,
  Search,
  Toilet,
  TicketCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import MapCanvas, {
  AttributionControl,
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

import { useFrederickFlavorStyle } from "@/components/map/useFrederickFlavorStyle";
import { readSavedFairCar, type SavedFairCar } from "@/lib/fair/car-memory";
import {
  FAIR_GROUNDS_MAP_URL,
  fairGroundsFeatureMatchesFilter,
  fairGroundsFeatureMatchesPlace,
  fairGroundsMapKindLabel,
  parseFairGroundsMap,
  type FairGroundsMap,
  type FairGroundsMapFeature,
  type FairGroundsMapFilter,
  type FairGroundsMapKind,
} from "@/lib/fair/grounds-map";
import { OPEN_FEEDBACK_EVENT } from "@/lib/feedback-ui";
import { mapCameraDuration } from "@/lib/motion";

export type FairGroundsMapSavedStop = {
  id: string;
  title: string;
  placeLabel: string;
};

export type FairGroundsMapProgramItem = {
  id: string;
  title: string;
  timeLabel: string;
  placeLabel: string;
};

export type FairGroundsMapProps = {
  savedStops: FairGroundsMapSavedStop[];
  programItems: FairGroundsMapProgramItem[];
  onBrowseProgram: () => void;
};

const FAIR_VIEW = {
  longitude: -77.3943,
  latitude: 39.4125,
  zoom: 16.25,
};
const FAIR_BOUNDS: [number, number, number, number] = [
  -77.4045, 39.4065, -77.385, 39.4205,
];
const FAIR_GROUNDS_BOUNDS: [number, number, number, number] = [
  -77.398595, 39.4101944, -77.391291, 39.4152037,
];

const FILTERS: Array<{
  id: FairGroundsMapFilter;
  label: string;
  kinds: FairGroundsMapKind[];
}> = [
  { id: "essentials", label: "Entry + essentials", kinds: ["gate", "ticket", "restroom", "stage"] },
  { id: "animals", label: "Animals", kinds: ["animal"] },
  { id: "buildings", label: "Buildings", kinds: ["building"] },
  { id: "parking", label: "Parking (Lot A)", kinds: ["parking"] },
];

const MARKER_THEME: Record<
  Exclude<FairGroundsMapKind, "fairgrounds">,
  { color: string; background: string }
> = {
  gate: { color: "var(--app-brand-press)", background: "var(--app-brand-tint-6)" },
  ticket: { color: "var(--app-brand-press)", background: "var(--app-brand-tint-6)" },
  restroom: { color: "var(--app-cool)", background: "var(--app-bg-elevated-solid)" },
  building: { color: "var(--app-ink-2)", background: "var(--app-bg-elevated-solid)" },
  animal: { color: "var(--app-brand-2)", background: "var(--app-bg-elevated-solid)" },
  stage: { color: "var(--app-accent-press)", background: "var(--app-bg-elevated-solid)" },
  parking: { color: "var(--app-cool)", background: "var(--app-bg-elevated-solid)" },
};

function markerIcon(kind: FairGroundsMapKind) {
  return {
    gate: DoorOpen,
    ticket: TicketCheck,
    restroom: Toilet,
    building: Building2,
    animal: PawPrint,
    stage: Megaphone,
    parking: CircleParking,
    fairgrounds: MapPin,
  }[kind];
}

function checkedLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function mappedFeatureName(
  feature: FairGroundsMapFeature,
  map: FairGroundsMap,
): string {
  const duplicates = map.features
    .filter(
      (candidate) =>
        candidate.properties.name === feature.properties.name &&
        candidate.properties.kind === feature.properties.kind,
    )
    .sort(
      (left, right) =>
        right.properties.anchor[1] - left.properties.anchor[1] ||
        left.properties.anchor[0] - right.properties.anchor[0],
    );
  if (duplicates.length < 2) return feature.properties.name;
  const markerNumber =
    duplicates.findIndex(
      (candidate) => candidate.properties.id === feature.properties.id,
    ) + 1;
  return `${feature.properties.name} · map marker ${markerNumber}`;
}

function isNearFair(longitude: number, latitude: number): boolean {
  return (
    longitude >= FAIR_BOUNDS[0] &&
    longitude <= FAIR_BOUNDS[2] &&
    latitude >= FAIR_BOUNDS[1] &&
    latitude <= FAIR_BOUNDS[3]
  );
}

function reportMapIssue(feature: FairGroundsMapFeature | null) {
  window.dispatchEvent(
    new CustomEvent(OPEN_FEEDBACK_EVENT, {
      detail: {
        fairIssue: "map_wrong",
        fairContext: feature
          ? `${feature.properties.name} · ${feature.properties.id}`
          : "Fair grounds map",
      },
    }),
  );
}

export default function FairGroundsMapInner({
  savedStops,
  programItems,
  onBrowseProgram,
}: FairGroundsMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const mapStyle = useFrederickFlavorStyle();
  const [mapData, setMapData] = useState<FairGroundsMap | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<FairGroundsMapFilter>("essentials");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [visitorLocation, setVisitorLocation] = useState<{
    longitude: number;
    latitude: number;
  } | null>(null);
  const [savedCar] = useState<SavedFairCar | null>(() => {
    if (typeof window === "undefined") return null;
    return readSavedFairCar(window.localStorage);
  });

  useEffect(() => {
    let active = true;
    fetch(FAIR_GROUNDS_MAP_URL, { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Fair map returned ${response.status}`);
        return parseFairGroundsMap(await response.json());
      })
      .then((map) => {
        if (active) setMapData(map);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const savedStopMatches = useMemo(() => {
    if (!mapData) return new Map<string, FairGroundsMapSavedStop[]>();
    return new Map(
      mapData.features.flatMap((feature) => {
        const matches = savedStops.filter((stop) =>
          fairGroundsFeatureMatchesPlace(feature, stop.placeLabel),
        );
        return matches.length > 0
          ? ([[feature.properties.id, matches]] as const)
          : [];
      }),
    );
  }, [mapData, savedStops]);
  const programMatches = useMemo(() => {
    if (!mapData) return new Map<string, FairGroundsMapProgramItem[]>();
    return new Map(
      mapData.features.flatMap((feature) => {
        const matches = programItems.filter((item) =>
          fairGroundsFeatureMatchesPlace(feature, item.placeLabel),
        );
        return matches.length > 0
          ? ([[feature.properties.id, matches]] as const)
          : [];
      }),
    );
  }, [mapData, programItems]);

  const visibleFeatures = useMemo(
    () =>
      mapData?.features.filter(
        (feature) =>
          fairGroundsFeatureMatchesFilter(feature, filter) ||
          savedStopMatches.has(feature.properties.id),
      ) ?? [],
    [filter, mapData, savedStopMatches],
  );
  const visiblePolygons = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: visibleFeatures.filter(
        (feature) => feature.geometry.type === "Polygon",
      ),
    }),
    [visibleFeatures],
  );
  const selected =
    mapData?.features.find((feature) => feature.properties.id === selectedId) ??
    null;
  const searchMatches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!mapData || normalized.length < 2) return [];
    return mapData.features
      .filter((feature) => feature.properties.kind !== "fairgrounds")
      .filter((feature) =>
        [
          feature.properties.name,
          fairGroundsMapKindLabel(feature.properties.kind),
          ...feature.properties.scheduleAliases,
          ...(programMatches.get(feature.properties.id) ?? []).map(
            (item) => item.title,
          ),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalized),
      )
      .slice(0, 6);
  }, [mapData, programMatches, query]);
  const selectedStops = selected
    ? (savedStopMatches.get(selected.properties.id) ?? [])
    : [];
  const selectedProgramItems = selected
    ? (programMatches.get(selected.properties.id) ?? [])
    : [];
  const mappedSavedStopIds = new Set(
    Array.from(savedStopMatches.values()).flatMap((stops) =>
      stops.map((stop) => stop.id),
    ),
  );
  const counts = useMemo(() => {
    if (!mapData) return new Map<FairGroundsMapKind, number>();
    const next = new Map<FairGroundsMapKind, number>();
    mapData.features.forEach((feature) =>
      next.set(
        feature.properties.kind,
        (next.get(feature.properties.kind) ?? 0) + 1,
      ),
    );
    return next;
  }, [mapData]);

  const chooseFeature = (feature: FairGroundsMapFeature) => {
    setSelectedId(feature.properties.id);
    mapRef.current?.getMap().easeTo({
      center: feature.properties.anchor,
      zoom: Math.max(mapRef.current?.getZoom() ?? FAIR_VIEW.zoom, 17),
      duration: mapCameraDuration("focus"),
      padding: { top: 44, right: 44, bottom: 84, left: 44 },
    });
  };

  const fitFeatures = (features: FairGroundsMapFeature[]) => {
    const anchors = features
      .filter((feature) => feature.properties.kind !== "fairgrounds")
      .map((feature) => feature.properties.anchor);
    const map = mapRef.current?.getMap();
    if (!map || anchors.length === 0) return;
    if (anchors.length === 1) {
      map.easeTo({
        center: anchors[0],
        zoom: 17.25,
        duration: mapCameraDuration("focus"),
      });
      return;
    }
    const longitudes = anchors.map(([longitude]) => longitude);
    const latitudes = anchors.map(([, latitude]) => latitude);
    map.fitBounds(
      [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)],
      ],
      {
        padding: 52,
        maxZoom: 17.25,
        duration: mapCameraDuration("focus"),
      },
    );
  };

  const fitFilter = (nextFilter: FairGroundsMapFilter) => {
    if (!mapData) return;
    fitFeatures(
      mapData.features.filter((feature) =>
        fairGroundsFeatureMatchesFilter(feature, nextFilter),
      ),
    );
  };

  const showWholeGrounds = () => {
    mapRef.current?.getMap().fitBounds(
      [
        [FAIR_GROUNDS_BOUNDS[0], FAIR_GROUNDS_BOUNDS[1]],
        [FAIR_GROUNDS_BOUNDS[2], FAIR_GROUNDS_BOUNDS[3]],
      ],
      {
        padding: 34,
        maxZoom: 17.15,
        duration: mapCameraDuration("focus"),
      },
    );
  };

  const chooseSearchResult = (feature: FairGroundsMapFeature) => {
    const nextFilter: FairGroundsMapFilter =
      feature.properties.kind === "animal"
        ? "animals"
        : feature.properties.kind === "building"
          ? "buildings"
          : feature.properties.kind === "parking"
            ? "parking"
            : "essentials";
    setFilter(nextFilter);
    setQuery("");
    chooseFeature(feature);
  };

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setLocationStatus("Location is not available on this device.");
      return;
    }
    setLocating(true);
    setLocationStatus(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const longitude = position.coords.longitude;
        const latitude = position.coords.latitude;
        if (!isNearFair(longitude, latitude)) {
          setVisitorLocation(null);
          setLocationStatus(
            "You appear to be outside the mapped Fair area. The map stayed centered on the grounds.",
          );
          return;
        }
        const approximateFeet = Math.max(
          10,
          Math.round((position.coords.accuracy * 3.28084) / 10) * 10,
        );
        if (position.coords.accuracy > 60) {
          setVisitorLocation(null);
          setLocationStatus(
            `Your location reading is too broad to place safely on this map (within about ${approximateFeet} feet). Try again in a more open area.`,
          );
          return;
        }
        setVisitorLocation({ longitude, latitude });
        setLocationStatus(
          `Your position is shown within about ${approximateFeet} feet for this visit only.`,
        );
        mapRef.current?.getMap().easeTo({
          center: [longitude, latitude],
          zoom: 17.4,
          duration: mapCameraDuration("focus"),
        });
      },
      () => {
        setLocating(false);
        setLocationStatus(
          "Radius could not get your position. You can still use gates and landmarks.",
        );
      },
      { enableHighAccuracy: true, timeout: 9_000, maximumAge: 0 },
    );
  };

  if (loadFailed) {
    return (
      <div
        className="mt-5 rounded-[var(--app-radius-xl)] border p-5"
        style={{
          borderColor: "var(--app-border-strong)",
          background: "var(--app-bg-elevated)",
        }}
        role="status"
      >
        <p className="text-[18px] font-bold">The grounds map could not open.</p>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Your plan is still here. Browse the reviewed program or use the official vendor guide while Radius retries on your next visit.
        </p>
        <button
          type="button"
          onClick={onBrowseProgram}
          className="tap-44 mt-4 inline-flex min-h-11 items-center font-semibold"
          style={{ color: "var(--app-brand-press)" }}
        >
          Browse the program
        </button>
      </div>
    );
  }

  if (!mapData) {
    return (
      <div
        className="mt-5 h-[52dvh] min-h-[430px] max-h-[560px] animate-pulse rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-sunken)] motion-reduce:animate-none"
        style={{ borderColor: "var(--app-border-strong)" }}
        role="status"
        aria-label="Loading reviewed Fair map data"
      />
    );
  }

  return (
    <section className="mt-5" aria-labelledby="fair-grounds-map-heading" data-fair-grounds-map>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.13em]" style={{ color: "var(--app-cool)" }}>
            Source-checked grounds map
          </p>
          <h2 id="fair-grounds-map-heading" className="mt-1 text-[24px] font-extrabold tracking-[-0.035em]">
            Find it before you need it.
          </h2>
        </div>
        <span
          className="rounded-full border px-3 py-1.5 text-[12px] font-semibold"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          Checked {checkedLabel(mapData.reviewedOn)}
        </span>
      </div>

      <div className="relative mt-4">
        <label htmlFor="fair-map-search" className="sr-only">
          Find a place or program event on the Fair grounds map
        </label>
        <Search
          className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2"
          style={{ color: "var(--app-ink-3)" }}
          aria-hidden
        />
        <input
          id="fair-map-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a place or program event"
          autoComplete="off"
          className="tap-44 min-h-12 w-full rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated-solid)] py-3 pl-11 pr-11 text-[14px] font-semibold outline-none placeholder:font-medium focus-visible:ring-2"
          style={{
            borderColor: "var(--app-border-strong)",
            color: "var(--app-ink)",
            boxShadow: "var(--app-elev-1)",
          }}
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="tap-44 absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full"
            aria-label="Clear map search"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        {query.trim().length >= 2 ? (
          <div
            className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-30 overflow-hidden rounded-[var(--app-radius-lg)] border p-1"
            style={{
              borderColor: "var(--app-border-strong)",
              background: "var(--app-bg-elevated-solid)",
              boxShadow: "var(--app-elev-3)",
            }}
            role="listbox"
            aria-label="Fair map search results"
          >
            {searchMatches.length > 0 ? (
              searchMatches.map((feature) => (
                <button
                  key={feature.properties.id}
                  type="button"
                  role="option"
                  aria-selected={selectedId === feature.properties.id}
                  onClick={() => chooseSearchResult(feature)}
                  className="tap-44 flex min-h-12 w-full items-center justify-between gap-3 rounded-[calc(var(--app-radius-lg)-5px)] px-3 py-2 text-left hover:bg-[var(--app-bg-sunken)] focus-visible:bg-[var(--app-bg-sunken)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-bold">
                      {mappedFeatureName(feature, mapData)}
                    </span>
                    <span
                      className="block text-[11px] font-semibold"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {fairGroundsMapKindLabel(feature.properties.kind)}
                    </span>
                  </span>
                  <MapPin
                    className="h-4 w-4 shrink-0"
                    style={{ color: "var(--app-brand-press)" }}
                    aria-hidden
                  />
                </button>
              ))
            ) : (
              <p
                className="px-3 py-3 text-[13px] font-semibold"
                style={{ color: "var(--app-ink-2)" }}
              >
                No reviewed map place matches that yet.
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div
        className="scrollbar-none -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6"
        role="group"
        aria-label="Choose what the Fair map shows"
      >
        {FILTERS.map((option) => {
          const active = option.id === filter;
          const count = option.kinds.reduce(
            (total, kind) => total + (counts.get(kind) ?? 0),
            0,
          );
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setFilter(option.id);
                setSelectedId(null);
                fitFilter(option.id);
              }}
              className="tap-44 min-h-11 shrink-0 rounded-full border px-3 text-[12px] font-semibold"
              style={{
                borderColor: active ? "var(--app-ink)" : "var(--app-border-strong)",
                color: active ? "var(--app-ink-inverse)" : "var(--app-ink-2)",
                background: active ? "var(--app-ink)" : "var(--app-bg-elevated)",
              }}
            >
              {option.label} · {count}
            </button>
          );
        })}
      </div>

      <div className="mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-4">
        <div
          className="fair-grounds-map-canvas relative h-[52dvh] min-h-[430px] max-h-[560px] overflow-hidden rounded-[var(--app-radius-xl)] border lg:h-[620px] lg:max-h-none"
          style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-sunken)" }}
        >
          <MapCanvas
            ref={mapRef}
            initialViewState={FAIR_VIEW}
            mapStyle={mapStyle}
            style={{ position: "absolute", inset: 0 }}
            maxBounds={FAIR_BOUNDS}
            minZoom={14.8}
            maxZoom={19}
            reuseMaps
            attributionControl={false}
            dragRotate={false}
            touchPitch={false}
            onLoad={showWholeGrounds}
            onClick={() => setSelectedId(null)}
          >
            <AttributionControl compact position="bottom-right" />
            <NavigationControl position="top-right" showCompass={false} />
            <Source id="fair-reviewed-geometry" type="geojson" data={visiblePolygons}>
              <Layer
                id="fair-reviewed-fill"
                type="fill"
                paint={{
                  "fill-color": [
                    "match",
                    ["get", "kind"],
                    "fairgrounds",
                    "#B5462B",
                    "animal",
                    "#315A43",
                    "stage",
                    "#7E2C6F",
                    "parking",
                    "#285D73",
                    "#C58A32",
                  ],
                  "fill-opacity": [
                    "case",
                    ["==", ["get", "kind"], "fairgrounds"],
                    0.07,
                    0.24,
                  ],
                }}
              />
              <Layer
                id="fair-reviewed-outline"
                type="line"
                paint={{
                  "line-color": [
                    "match",
                    ["get", "kind"],
                    "fairgrounds",
                    "#B5462B",
                    "animal",
                    "#315A43",
                    "stage",
                    "#7E2C6F",
                    "parking",
                    "#285D73",
                    "#925E16",
                  ],
                  "line-width": [
                    "case",
                    ["==", ["get", "kind"], "fairgrounds"],
                    2.5,
                    1.6,
                  ],
                }}
              />
            </Source>

            {visibleFeatures
              .filter((feature) => feature.properties.kind !== "fairgrounds")
              .map((feature) => {
                const kind = feature.properties.kind as Exclude<
                  FairGroundsMapKind,
                  "fairgrounds"
                >;
                const theme = MARKER_THEME[kind];
                const Icon = markerIcon(kind);
                const savedMatches = savedStopMatches.get(feature.properties.id) ?? [];
                const scheduledHere = programMatches.get(feature.properties.id) ?? [];
                const selectedMarker = selectedId === feature.properties.id;
                const gateLabel =
                  kind === "gate"
                    ? (feature.properties.name.match(/\b\d+A?\b/)?.[0] ?? "LM")
                    : null;
                return (
                  <Marker
                    key={feature.properties.id}
                    longitude={feature.properties.anchor[0]}
                    latitude={feature.properties.anchor[1]}
                    anchor="center"
                    onClick={(event) => {
                      event.originalEvent.stopPropagation();
                      chooseFeature(feature);
                    }}
                  >
                    <button
                      type="button"
                      className="tap-44 relative grid h-11 w-11 place-items-center rounded-full"
                      aria-label={`Open ${mappedFeatureName(feature, mapData)}, ${fairGroundsMapKindLabel(kind)}`}
                    >
                      <span
                        className="grid h-8 w-8 place-items-center rounded-full border-2"
                        style={{
                          color: selectedMarker ? "var(--app-ink-inverse)" : theme.color,
                          background: selectedMarker ? "var(--app-ink)" : theme.background,
                          borderColor: selectedMarker ? "var(--app-ink-inverse)" : theme.color,
                          boxShadow: "0 3px 10px rgba(34, 28, 21, 0.24)",
                        }}
                      >
                        {gateLabel ? (
                          <span
                            className="text-[10px] font-extrabold leading-none tabular-nums"
                            aria-hidden
                          >
                            {gateLabel}
                          </span>
                        ) : (
                          <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                        )}
                      </span>
                      {savedMatches.length > 0 ? (
                        <span
                          className="absolute right-0 top-0 grid h-5 min-w-5 place-items-center rounded-full border px-1 text-[10px] font-bold tabular-nums"
                          style={{
                            color: "var(--app-on-brand)",
                            background: "var(--app-brand)",
                            borderColor: "var(--app-ink-inverse)",
                          }}
                          aria-hidden
                        >
                          {savedStops.findIndex((stop) => stop.id === savedMatches[0].id) + 1}
                        </span>
                      ) : null}
                      {scheduledHere.length > 0 ? (
                        <span
                          className="absolute bottom-0 left-0 grid h-5 min-w-5 place-items-center rounded-full border px-1 text-[10px] font-bold tabular-nums"
                          style={{
                            color: "var(--app-ink)",
                            background: "var(--app-accent-soft)",
                            borderColor: "var(--app-bg-elevated-solid)",
                          }}
                          aria-hidden
                        >
                          {scheduledHere.length}
                        </span>
                      ) : null}
                    </button>
                  </Marker>
                );
              })}

            {savedCar &&
            savedCar.longitude !== null &&
            savedCar.latitude !== null ? (
              <Marker longitude={savedCar.longitude} latitude={savedCar.latitude} anchor="bottom">
                <span
                  className="grid h-10 w-10 place-items-center rounded-full border-2"
                  style={{
                    color: "var(--app-ink-inverse)",
                    background: "var(--app-cool)",
                    borderColor: "var(--app-ink-inverse)",
                    boxShadow: "0 3px 12px rgba(34, 28, 21, 0.3)",
                  }}
                  title="Saved car location"
                >
                  <CircleParking className="h-5 w-5" aria-hidden />
                </span>
              </Marker>
            ) : null}

            {visitorLocation ? (
              <Marker longitude={visitorLocation.longitude} latitude={visitorLocation.latitude} anchor="center">
                <span
                  className="block h-4 w-4 rounded-full border-[3px]"
                  style={{
                    background: "var(--app-cool)",
                    borderColor: "var(--app-ink-inverse)",
                    boxShadow: "0 0 0 5px color-mix(in srgb, var(--app-cool) 22%, transparent)",
                  }}
                  title="Your approximate location"
                />
              </Marker>
            ) : null}
          </MapCanvas>

          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="tap-44 absolute left-3 top-3 z-10 inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-[12px] font-bold disabled:opacity-60"
            style={{
              color: "var(--app-ink)",
              background: "var(--app-bg-elevated-solid)",
              borderColor: "var(--app-border-strong)",
              boxShadow: "var(--app-elev-1)",
            }}
          >
            <LocateFixed className="h-4 w-4" aria-hidden />
            {locating ? "Locating…" : "Show me"}
          </button>

          <button
            type="button"
            onClick={showWholeGrounds}
            className="tap-44 absolute left-3 top-[4.25rem] z-10 inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-[12px] font-bold"
            style={{
              color: "var(--app-ink)",
              background: "var(--app-bg-elevated-solid)",
              borderColor: "var(--app-border-strong)",
              boxShadow: "var(--app-elev-1)",
            }}
          >
            <Scan className="h-4 w-4" aria-hidden />
            Whole grounds
          </button>

          {selected ? (
            <div
              className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[70] mx-auto max-w-[30rem] rounded-[var(--app-radius-lg)] border p-4 lg:hidden"
              style={{
                borderColor: "var(--app-border-strong)",
                background: "var(--app-bg-elevated-solid)",
                boxShadow:
                  "var(--app-elev-3), var(--app-edge), var(--app-hi)",
              }}
              role="region"
              aria-live="polite"
              aria-label={`Selected map place: ${mappedFeatureName(selected, mapData)}`}
            >
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="tap-44 absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full"
                aria-label="Close selected map place"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <p
                className="pr-10 text-[11px] font-bold uppercase tracking-[0.11em]"
                style={{ color: "var(--app-brand-press)" }}
              >
                {fairGroundsMapKindLabel(selected.properties.kind)}
              </p>
              <h3 className="mt-1 pr-10 text-[20px] font-extrabold leading-tight tracking-[-0.03em]">
                {mappedFeatureName(selected, mapData)}
              </h3>
              {selectedStops.length > 0 ? (
                <p
                  className="mt-2 text-[12px] font-semibold"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  Saved in My Day: {selectedStops.map((stop) => stop.title).join(", ")}
                </p>
              ) : null}
              {selectedProgramItems.length > 0 ? (
                <div
                  className="mt-3 border-l-2 pl-3"
                  style={{ borderColor: "var(--app-accent)" }}
                >
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    On your selected day
                  </p>
                  {selectedProgramItems.slice(0, 2).map((item) => (
                    <p key={item.id} className="mt-1 text-[12px] font-semibold leading-snug">
                      <span className="tabular-nums" style={{ color: "var(--app-brand-press)" }}>
                        {item.timeLabel}
                      </span>{" "}
                      · {item.title}
                    </p>
                  ))}
                  {selectedProgramItems.length > 2 ? (
                    <button
                      type="button"
                      onClick={onBrowseProgram}
                      className="tap-44 mt-1 inline-flex min-h-11 items-center text-[11px] font-bold"
                      style={{ color: "var(--app-cool)" }}
                    >
                      See {selectedProgramItems.length - 2} more in Program
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div
                className="mt-3 flex flex-wrap items-center gap-3 border-t pt-2"
                style={{ borderColor: "var(--app-border)" }}
              >
                <button
                  type="button"
                  onClick={() => reportMapIssue(selected)}
                  className="tap-44 inline-flex min-h-11 items-center gap-1.5 text-[12px] font-bold"
                  style={{ color: "var(--app-brand-press)" }}
                >
                  <MessageSquareWarning className="h-4 w-4" aria-hidden />
                  Report issue
                </button>
                <a
                  href={selected.properties.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-44 inline-flex min-h-11 items-center gap-1.5 text-[12px] font-semibold"
                  style={{ color: "var(--app-cool)" }}
                >
                  Mapped source
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              </div>
            </div>
          ) : null}
        </div>

        <aside
          className={`relative z-10 -mt-4 mx-2 rounded-[var(--app-radius-xl)] border p-4 lg:mx-0 lg:mt-0 lg:min-h-[620px] lg:flex-col lg:p-5 ${
            selected ? "hidden lg:flex" : "lg:flex"
          }`}
          style={{
            borderColor: "var(--app-border-strong)",
            background: "var(--app-bg-elevated-solid)",
            boxShadow: "var(--app-elev-2), var(--app-edge), var(--app-hi)",
          }}
          aria-live="polite"
        >
          {selected ? (
            <>
              <p className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-brand-press)" }}>
                {fairGroundsMapKindLabel(selected.properties.kind)}
              </p>
              <h3 className="mt-1 text-[22px] font-extrabold leading-tight tracking-[-0.035em]">
                {mappedFeatureName(selected, mapData)}
              </h3>
              {selectedStops.length > 0 ? (
                <div className="mt-4 border-l-2 pl-3" style={{ borderColor: "var(--app-brand)" }}>
                  <p className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--app-brand-press)" }}>
                    In My Day
                  </p>
                  {selectedStops.map((stop) => (
                    <p key={stop.id} className="mt-1 text-[13px] font-semibold leading-snug">
                      {stop.title}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                  Use this mapped landmark to orient yourself. Radius does not infer an indoor entrance or walking route.
                </p>
              )}
              {selectedProgramItems.length > 0 ? (
                <div
                  className="mt-4 border-l-2 pl-3"
                  style={{ borderColor: "var(--app-accent)" }}
                >
                  <p
                    className="text-[11px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    On your selected day
                  </p>
                  {selectedProgramItems.slice(0, 3).map((item) => (
                    <p key={item.id} className="mt-2 text-[12px] font-semibold leading-snug">
                      <span className="tabular-nums" style={{ color: "var(--app-brand-press)" }}>
                        {item.timeLabel}
                      </span>{" "}
                      · {item.title}
                    </p>
                  ))}
                  {selectedProgramItems.length > 3 ? (
                    <button
                      type="button"
                      onClick={onBrowseProgram}
                      className="tap-44 mt-2 inline-flex min-h-11 items-center text-[11px] font-bold"
                      style={{ color: "var(--app-cool)" }}
                    >
                      See {selectedProgramItems.length - 3} more in Program
                    </button>
                  ) : null}
                </div>
              ) : null}
              <a
                href={selected.properties.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-44 mt-3 inline-flex min-h-11 items-center gap-1.5 text-[12px] font-semibold"
                style={{ color: "var(--app-cool)" }}
              >
                View mapped source
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </>
          ) : (
            <>
              <p className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-brand-press)" }}>
                Your bearings
              </p>
              <h3 className="mt-1 text-[22px] font-extrabold leading-tight tracking-[-0.035em]">
                Tap a marker, not a directory.
              </h3>
              <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                Start with gates, restrooms, and show areas. Switch the layer when you want animals, buildings, or parking.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)] p-3">
                  <p className="text-[22px] font-extrabold tabular-nums">{counts.get("gate") ?? 0}</p>
                  <p className="text-[12px] font-semibold" style={{ color: "var(--app-ink-3)" }}>mapped gates</p>
                </div>
                <div className="rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)] p-3">
                  <p className="text-[22px] font-extrabold tabular-nums">{counts.get("restroom") ?? 0}</p>
                  <p className="text-[12px] font-semibold" style={{ color: "var(--app-ink-3)" }}>restroom points</p>
                </div>
              </div>
            </>
          )}

          {savedStops.length > 0 ? (
            <p className="mt-4 text-[12px] font-semibold leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {mappedSavedStopIds.size} of {savedStops.length} saved {savedStops.length === 1 ? "stop has" : "stops have"} reviewed map geometry. Radius leaves the rest unpinned rather than guessing.
            </p>
          ) : null}

          {savedCar && savedCar.latitude === null ? (
            <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Saved car: {savedCar.lotLabel ?? "note only"}. Save a precise location in Travel to place it on this map.
            </p>
          ) : null}

          {locationStatus ? (
            <p className="mt-3 text-[12px] leading-relaxed" role="status" style={{ color: "var(--app-cool)" }}>
              {locationStatus}
            </p>
          ) : null}

          <div className="mt-4 border-t pt-3 lg:mt-auto" style={{ borderColor: "var(--app-border)" }}>
            <button
              type="button"
              onClick={() => reportMapIssue(selected)}
              className="tap-44 inline-flex min-h-11 items-center gap-2 text-[12px] font-bold"
              style={{ color: "var(--app-brand-press)" }}
            >
              <MessageSquareWarning className="h-4 w-4" aria-hidden />
              Report a map issue
            </button>
            <p
              className="mt-2 text-[11px] leading-relaxed"
              style={{ color: "var(--app-ink-3)" }}
            >
              Map features: {" "}
              <a
                href={mapData.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {mapData.source.publisher}, {mapData.source.license}
              </a>
              . Follow current on-site signs.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
