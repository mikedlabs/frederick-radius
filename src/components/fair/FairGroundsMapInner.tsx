"use client";

import {
  Accessibility,
  Building2,
  BusFront,
  ChevronDown,
  CircleParking,
  DoorOpen,
  ExternalLink,
  LocateFixed,
  MapPin,
  MessageSquareWarning,
  Megaphone,
  Navigation,
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
import {
  greatFrederickFair2026MapAdditions,
  greatFrederickFair2026MapPatches,
} from "@/data/fair/great-frederick-fair-2026-map-overlays";
import { readSavedFairCar, type SavedFairCar } from "@/lib/fair/car-memory";
import {
  FAIR_GROUNDS_MAP_URL,
  enrichFairGroundsMap,
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
import { directionsHref } from "@/lib/map/directionsHref";
import { mapCameraDuration } from "@/lib/motion";

import FairGroundsMapLoading from "./FairGroundsMapLoading";
import FairGroundsMapMasthead from "./FairGroundsMapMasthead";

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
  tone: string;
}> = [
  {
    id: "essentials",
    label: "Entry + essentials",
    tone: "var(--app-brand-press)",
  },
  {
    id: "animals",
    label: "Animals",
    tone: "var(--app-brand-2)",
  },
  {
    id: "buildings",
    label: "Buildings",
    tone: "var(--app-warning-press)",
  },
  {
    id: "arrival",
    label: "Parking + transit",
    tone: "var(--app-cool)",
  },
];

const ACCESSIBLE_PLACE_GROUPS: Array<{
  id: "arrive" | "essentials" | "explore";
  label: string;
  detail: string;
  kinds: readonly FairGroundsMapKind[];
}> = [
  {
    id: "arrive",
    label: "Arrive and enter",
    detail: "Parking, transit, and gates",
    kinds: ["parking", "transit", "gate"],
  },
  {
    id: "essentials",
    label: "Find essentials",
    detail: "Restrooms, tickets, and guest services",
    kinds: ["restroom", "ticket", "service"],
  },
  {
    id: "explore",
    label: "Explore the grounds",
    detail: "Buildings, animals, and show areas",
    kinds: ["building", "animal", "stage"],
  },
];

const MARKER_THEME: Record<
  Exclude<FairGroundsMapKind, "fairgrounds">,
  { color: string; background: string }
> = {
  gate: { color: "var(--app-brand-press)", background: "var(--app-brand-tint-6)" },
  ticket: { color: "var(--app-brand-press)", background: "var(--app-brand-tint-6)" },
  restroom: { color: "var(--app-cool)", background: "var(--app-bg-elevated-solid)" },
  building: { color: "var(--app-warning-press)", background: "var(--app-bg-elevated-solid)" },
  animal: { color: "var(--app-brand-2)", background: "var(--app-bg-elevated-solid)" },
  stage: { color: "var(--app-accent-press)", background: "var(--app-bg-elevated-solid)" },
  parking: { color: "var(--app-cool)", background: "var(--app-bg-elevated-solid)" },
  service: { color: "var(--app-cool)", background: "var(--app-bg-elevated-solid)" },
  transit: { color: "var(--app-cool)", background: "var(--app-bg-elevated-solid)" },
};

function markerTone(kind: FairGroundsMapKind): string {
  return kind === "fairgrounds"
    ? "var(--app-brand-press)"
    : MARKER_THEME[kind].color;
}

function markerIcon(kind: FairGroundsMapKind) {
  return {
    gate: DoorOpen,
    ticket: TicketCheck,
    restroom: Toilet,
    building: Building2,
    animal: PawPrint,
    stage: Megaphone,
    parking: CircleParking,
    service: Accessibility,
    transit: BusFront,
    fairgrounds: MapPin,
  }[kind];
}

function locationPrecisionLabel(
  precision: FairGroundsMapFeature["properties"]["locationPrecision"],
): string | null {
  return {
    "mapped-feature": "Reviewed mapped feature",
    "official-pin": "Official arrival pin",
    "published-area": "Published area; follow signs",
    "static-transit-stop": "Static county transit stop",
  }[precision ?? "mapped-feature"] ?? null;
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

function FairMapFeatureActions({
  feature,
}: {
  feature: FairGroundsMapFeature;
}) {
  const informationSource = feature.properties.informationSource;
  const mappedSourceIsInformationSource =
    informationSource?.url === feature.properties.sourceUrl;
  const mappedSourceLabel = feature.properties.id.startsWith("osm-")
    ? "Mapped source"
    : feature.properties.kind === "parking"
      ? "Official entrance pin"
      : null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {feature.properties.directionsEnabled ? (
        <a
          href={directionsHref(
            feature.properties.anchor[1],
            feature.properties.anchor[0],
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[13px] font-bold"
          style={{
            color: "var(--app-ink-inverse)",
            background: "var(--app-cool)",
          }}
        >
          <Navigation className="h-4 w-4" aria-hidden />
          Get directions
        </a>
      ) : null}
      {informationSource ? (
        <a
          href={informationSource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44 inline-flex min-h-11 items-center gap-1.5 px-2 text-[13px] font-bold"
          style={{ color: "var(--app-cool)" }}
        >
          Official details
          <span className="sr-only"> from {informationSource.publisher}</span>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : null}
      {mappedSourceLabel && !mappedSourceIsInformationSource ? (
        <a
          href={feature.properties.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44 inline-flex min-h-11 items-center gap-1.5 px-2 text-[13px] font-semibold"
          style={{ color: "var(--app-ink-3)" }}
        >
          {mappedSourceLabel}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

export default function FairGroundsMapInner({
  savedStops,
  programItems,
  onBrowseProgram,
}: FairGroundsMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSelectionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const desktopSelectionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const lastSelectionTriggerRef = useRef<HTMLElement | null>(null);
  const focusedDeepLinkRef = useRef(false);
  const mapStyle = useFrederickFlavorStyle();
  const [mapData, setMapData] = useState<FairGroundsMap | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<FairGroundsMapFilter>("essentials");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionExpanded, setSelectionExpanded] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [mapAnnouncement, setMapAnnouncement] = useState("");
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
        return enrichFairGroundsMap(
          parseFairGroundsMap(await response.json()),
          greatFrederickFair2026MapPatches,
          greatFrederickFair2026MapAdditions,
        );
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

  useEffect(() => {
    if (
      !mapData ||
      focusedDeepLinkRef.current ||
      window.location.hash !== "#fair-map"
    ) {
      return;
    }
    focusedDeepLinkRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("fair-grounds-map-heading")?.focus({
        preventScroll: true,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mapData]);

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
  const accessibleFeatures = useMemo(
    () =>
      visibleFeatures
        .filter((feature) => feature.properties.kind !== "fairgrounds")
        .slice()
        .sort(
          (left, right) =>
            fairGroundsMapKindLabel(left.properties.kind).localeCompare(
              fairGroundsMapKindLabel(right.properties.kind),
            ) || left.properties.name.localeCompare(right.properties.name),
        ),
    [visibleFeatures],
  );
  const groupedAccessibleFeatures = useMemo(
    () =>
      ACCESSIBLE_PLACE_GROUPS.map((group) => ({
        ...group,
        features: accessibleFeatures.filter((feature) =>
          group.kinds.includes(feature.properties.kind),
        ),
      })).filter(
        (group) =>
          group.features.length > 0 ||
          (group.id === "arrive" &&
            savedCar !== null &&
            savedCar?.longitude !== null &&
            savedCar?.latitude !== null),
      ),
    [accessibleFeatures, savedCar],
  );
  const selected =
    mapData?.features.find((feature) => feature.properties.id === selectedId) ??
    null;
  const selectedTone = selected
    ? markerTone(selected.properties.kind)
    : "var(--app-brand-press)";
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
          ...(feature.properties.keywords ?? []),
          feature.properties.detail ?? "",
          feature.properties.informationSource?.title ?? "",
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
  const normalizedQuery = query.trim();
  const searchAnnouncement =
    normalizedQuery.length >= 2
      ? searchMatches.length > 0
        ? `${searchMatches.length} map ${searchMatches.length === 1 ? "result" : "results"} available. Tab to review them.`
        : "No reviewed map places match that search."
      : "";
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
  const filterCounts = useMemo(() => {
    if (!mapData) return new Map<FairGroundsMapFilter, number>();
    return new Map(
      FILTERS.map((option) => [
        option.id,
        mapData.features.filter(
          (feature) =>
            feature.properties.kind !== "fairgrounds" &&
            fairGroundsFeatureMatchesFilter(feature, option.id),
        ).length,
      ]),
    );
  }, [mapData]);

  const focusSelectedDetails = () => {
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    const heading = desktop
      ? desktopSelectionHeadingRef.current
      : mobileSelectionHeadingRef.current;
    heading?.focus({ preventScroll: true });
  };

  const chooseFeature = (
    feature: FairGroundsMapFeature,
    trigger?: HTMLElement,
  ) => {
    if (trigger) lastSelectionTriggerRef.current = trigger;
    setSelectionExpanded(false);
    setSelectedId(feature.properties.id);
    const selectedName = mapData
      ? mappedFeatureName(feature, mapData)
      : feature.properties.name;
    setMapAnnouncement(
      `${selectedName} selected. Details are open.`,
    );
    mapRef.current?.getMap().easeTo({
      center: feature.properties.anchor,
      zoom: Math.max(mapRef.current?.getZoom() ?? FAIR_VIEW.zoom, 17),
      duration: mapCameraDuration("focus"),
      padding: { top: 44, right: 44, bottom: 84, left: 44 },
    });
    window.requestAnimationFrame(focusSelectedDetails);
  };

  const closeSelection = () => {
    const returnTarget = lastSelectionTriggerRef.current;
    setSelectionExpanded(false);
    setSelectedId(null);
    setMapAnnouncement("Map place details closed.");
    window.requestAnimationFrame(() => {
      if (returnTarget?.isConnected) {
        returnTarget.focus({ preventScroll: true });
        return;
      }
      searchInputRef.current?.focus({ preventScroll: true });
    });
  };

  const browseProgram = () => {
    setSelectedId(null);
    onBrowseProgram();
    window.requestAnimationFrame(() => {
      document.getElementById("fair-find-heading")?.focus({ preventScroll: true });
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

  const handleMapLoad = () => {
    showWholeGrounds();
    const canvas = mapRef.current?.getMap().getCanvas();
    canvas?.setAttribute("role", "region");
    canvas?.setAttribute("aria-label", "Interactive Fairgrounds map");
    canvas?.setAttribute("aria-describedby", "fair-map-instructions");
  };

  const chooseSearchResult = (
    feature: FairGroundsMapFeature,
    trigger: HTMLElement,
  ) => {
    const nextFilter: FairGroundsMapFilter =
      feature.properties.kind === "animal"
        ? "animals"
        : feature.properties.kind === "building"
          ? "buildings"
          : feature.properties.kind === "parking" ||
              feature.properties.kind === "transit" ||
              feature.properties.filterIds?.includes("arrival")
            ? "arrival"
            : "essentials";
    setFilter(nextFilter);
    setQuery("");
    chooseFeature(feature, trigger);
  };

  const showSavedCar = (trigger: HTMLElement) => {
    if (
      !savedCar ||
      savedCar.longitude === null ||
      savedCar.latitude === null
    ) {
      return;
    }
    lastSelectionTriggerRef.current = trigger;
    setSelectedId(null);
    const label = savedCar.lotLabel
      ? `Saved car in ${savedCar.lotLabel}`
      : "Saved car location";
    setLocationStatus(`${label} is centered on the map.`);
    setMapAnnouncement(`${label} is centered on the map.`);
    mapRef.current?.getMap().easeTo({
      center: [savedCar.longitude, savedCar.latitude],
      zoom: 17.4,
      duration: mapCameraDuration("focus"),
    });
  };

  const updateLocationStatus = (message: string) => {
    setLocationStatus(message);
    setMapAnnouncement(message);
  };

  const locate = () => {
    if (!("geolocation" in navigator)) {
      updateLocationStatus("Location is not available on this device.");
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
          updateLocationStatus(
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
          updateLocationStatus(
            `Your location reading is too broad to place safely on this map (within about ${approximateFeet} feet). Try again in a more open area.`,
          );
          return;
        }
        setVisitorLocation({ longitude, latitude });
        updateLocationStatus(
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
        updateLocationStatus(
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
    return <FairGroundsMapLoading />;
  }

  return (
    <section className="relative lg:mt-5" aria-labelledby="fair-grounds-map-heading" data-fair-grounds-map>
      <div className="hidden lg:block">
        <FairGroundsMapMasthead checkedOn={mapData.reviewedOn} />
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {mapAnnouncement}
      </p>
      <p
        id="fair-map-search-status"
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {searchAnnouncement}
      </p>
      <p id="fair-map-instructions" className="sr-only">
        Use the map controls to zoom, or browse the mapped places as a list
        below. Grounds geometry comes from reviewed OpenStreetMap data. Official
        arrival pins and published transit stops identify their sources. Follow
        current signs on the grounds.
      </p>

      <div
        data-fair-map-search-rail
        className="absolute inset-x-3 top-3 z-30 lg:relative lg:inset-auto lg:top-auto lg:z-auto lg:mt-3"
      >
        <label htmlFor="fair-map-search" className="sr-only">
          Find a place or program event on the Fair grounds map
        </label>
        <Search
          className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2"
          style={{ color: "var(--app-ink-3)" }}
          aria-hidden
        />
        <input
          ref={searchInputRef}
          id="fair-map-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a place or program event"
          autoComplete="off"
          aria-controls={
            normalizedQuery.length >= 2
              ? "fair-map-search-results"
              : undefined
          }
          aria-describedby="fair-map-search-status"
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              setQuery("");
            }
          }}
          className="tap-44 min-h-12 w-full rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated-solid)] py-3 pl-11 pr-11 text-base font-semibold outline-none placeholder:font-medium focus-visible:border-[var(--app-brand-press)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--app-brand)_22%,transparent)]"
          style={{
            borderColor: "var(--app-control-border)",
            color: "var(--app-ink)",
            boxShadow: "var(--app-elev-1)",
          }}
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              window.requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
            className="tap-44 absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full"
            aria-label="Clear map search"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        {query.trim().length >= 2 ? (
          <div
            id="fair-map-search-results"
            className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-30 max-h-[min(18rem,50dvh)] overflow-y-auto overscroll-contain rounded-[var(--app-radius-lg)] border p-1"
            style={{
              borderColor: "var(--app-border-strong)",
              background: "var(--app-bg-elevated-solid)",
              boxShadow: "var(--app-elev-3)",
            }}
          >
            {searchMatches.length > 0 ? (
              <ul aria-label="Fair map search results">
                {searchMatches.map((feature) => (
                  <li key={feature.properties.id}>
                    <button
                      type="button"
                      onClick={(event) =>
                        chooseSearchResult(feature, event.currentTarget)
                      }
                      className="tap-44 flex min-h-12 w-full items-center justify-between gap-3 rounded-[calc(var(--app-radius-lg)-5px)] px-3 py-2 text-left hover:bg-[var(--app-bg-sunken)] focus-visible:bg-[var(--app-bg-sunken)]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-bold">
                          {mappedFeatureName(feature, mapData)}
                        </span>
                        <span
                          className="block text-[12px] font-semibold"
                          style={{ color: "var(--app-ink-3)" }}
                        >
                          {fairGroundsMapKindLabel(feature.properties.kind)}
                        </span>
                      </span>
                      <MapPin
                        className="h-4 w-4 shrink-0"
                        style={{ color: markerTone(feature.properties.kind) }}
                        aria-hidden
                      />
                    </button>
                  </li>
                ))}
              </ul>
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
        data-fair-map-filter-rail
        className="absolute inset-x-0 top-[4.15rem] z-20 lg:relative lg:inset-auto lg:top-auto lg:z-auto"
      >
        <div
          className="scrollbar-none flex gap-2 overflow-x-auto px-3 pb-1 pr-10 lg:-mx-6 lg:mt-4 lg:px-6"
          role="group"
          aria-label="Choose what the Fair map shows"
        >
          {FILTERS.map((option) => {
            const active = option.id === filter;
            const count = filterCounts.get(option.id) ?? 0;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setFilter(option.id);
                  setSelectedId(null);
                  setMapAnnouncement(
                    `${option.label} map layer selected. ${count} ${count === 1 ? "place" : "places"} shown.`,
                  );
                  fitFilter(option.id);
                }}
                className="tap-44 min-h-11 shrink-0 rounded-full border px-3 text-[13px] font-semibold"
                style={{
                  borderColor: active ? option.tone : "var(--app-control-border)",
                  color: active ? "var(--app-ink-inverse)" : "var(--app-ink-2)",
                  background: active ? option.tone : "var(--app-bg-elevated-solid)",
                  boxShadow: active
                    ? "0 6px 16px -12px var(--app-ink)"
                    : "inset 0 1px 0 color-mix(in srgb, white 65%, transparent)",
                }}
              >
                {option.label} · {count}
              </button>
            );
          })}
        </div>
        <div
          className="pointer-events-none absolute -bottom-0.5 -right-4 top-0 w-9 bg-gradient-to-r from-transparent to-[var(--app-bg)] sm:hidden"
          aria-hidden
        />
      </div>

      <div className="mt-0 lg:mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-4">
        <div
          className="fair-grounds-map-canvas relative h-[calc(100dvh-8rem)] min-h-[520px] overflow-hidden border-y lg:h-[620px] lg:min-h-0 lg:rounded-[var(--app-radius-xl)] lg:border"
          style={{
            borderColor: "var(--app-control-border)",
            background: "var(--app-bg-sunken)",
            boxShadow: "0 18px 40px -34px var(--app-ink), inset 0 0 0 1px color-mix(in srgb, var(--app-bg-elevated-solid) 72%, transparent)",
          }}
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
            cooperativeGestures
            onLoad={handleMapLoad}
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
                const mappedName = mappedFeatureName(feature, mapData);
                const savedDescription =
                  savedMatches.length > 0
                    ? `Saved in My Day as ${savedMatches.map((stop) => stop.title).join(", ")}.`
                    : "";
                const scheduleDescription =
                  scheduledHere.length > 0
                    ? `${scheduledHere.length} ${scheduledHere.length === 1 ? "program item" : "program items"} here on your selected day.`
                    : "";
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
                  >
                    <button
                      type="button"
                      className="fair-grounds-map-marker tap-44 relative grid h-11 w-11 place-items-center rounded-full"
                      aria-label={`${mappedName}. ${fairGroundsMapKindLabel(kind)}. ${savedDescription} ${scheduleDescription}`.trim()}
                      aria-expanded={selectedMarker}
                      aria-controls={
                        selectedMarker
                          ? "fair-map-selection-mobile fair-map-selection-desktop"
                          : undefined
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        chooseFeature(feature, event.currentTarget);
                      }}
                    >
                      <span
                        className="grid h-9 w-9 place-items-center rounded-full border-2"
                        style={{
                          color: selectedMarker ? "var(--app-ink-inverse)" : theme.color,
                          background: selectedMarker ? theme.color : theme.background,
                          borderColor: selectedMarker ? "var(--app-ink-inverse)" : theme.color,
                          boxShadow: selectedMarker
                            ? "0 0 0 3px var(--app-amber), 0 6px 16px rgba(34, 28, 21, 0.3)"
                            : "0 3px 10px rgba(34, 28, 21, 0.24)",
                        }}
                      >
                        {gateLabel ? (
                          <span
                            className="text-[12px] font-extrabold leading-none tabular-nums"
                            aria-hidden
                          >
                            {gateLabel}
                          </span>
                        ) : (
                          <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                        )}
                      </span>
                      {savedMatches.length > 0 ? (
                        <span
                          className="absolute right-0 top-0 grid h-5 min-w-5 place-items-center rounded-full border px-1 text-[12px] font-bold tabular-nums"
                          style={{
                            color: "var(--app-on-brand)",
                            background: "var(--app-brand-press)",
                            borderColor: "var(--app-ink-inverse)",
                          }}
                          aria-hidden
                        >
                          {savedStops.findIndex((stop) => stop.id === savedMatches[0].id) + 1}
                        </span>
                      ) : null}
                      {scheduledHere.length > 0 ? (
                        <span
                          className="absolute bottom-0 left-0 grid h-5 min-w-5 place-items-center rounded-full border px-1 text-[12px] font-bold tabular-nums"
                          style={{
                            color: "var(--app-ink)",
                            background: "var(--app-amber)",
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
                <button
                  type="button"
                  data-fair-saved-car
                  className="fair-grounds-map-marker tap-44 grid h-11 w-11 place-items-center rounded-full"
                  aria-label={`Show saved car location${savedCar.lotLabel ? `, ${savedCar.lotLabel}` : ""}${savedCar.note ? `, note: ${savedCar.note}` : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    showSavedCar(event.currentTarget);
                  }}
                >
                  <span
                    className="grid h-10 w-10 place-items-center rounded-full border-2"
                    style={{
                      color: "var(--app-ink-inverse)",
                      background: "var(--app-cool)",
                      borderColor: "var(--app-ink-inverse)",
                      boxShadow: "0 3px 12px rgba(34, 28, 21, 0.3)",
                    }}
                    aria-hidden
                  >
                    <CircleParking className="h-5 w-5" aria-hidden />
                  </span>
                </button>
              </Marker>
            ) : null}

            {visitorLocation ? (
              <Marker longitude={visitorLocation.longitude} latitude={visitorLocation.latitude} anchor="center">
                <span
                  data-fair-visitor-location
                  className="block h-4 w-4 rounded-full border-[3px]"
                  style={{
                    background: "var(--app-cool)",
                    borderColor: "var(--app-ink-inverse)",
                    boxShadow: "0 0 0 5px color-mix(in srgb, var(--app-cool) 22%, transparent)",
                  }}
                  aria-hidden
                />
              </Marker>
            ) : null}
          </MapCanvas>

          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="tap-44 absolute left-3 top-[7.75rem] z-10 inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-[13px] font-bold disabled:opacity-60 lg:top-3"
            style={{
              color: "var(--app-ink)",
              background: "var(--app-bg-elevated-solid)",
              borderColor: "var(--app-control-border)",
              boxShadow: "var(--app-elev-1)",
            }}
          >
            <LocateFixed className="h-4 w-4" aria-hidden />
            {locating ? "Finding location…" : "Show my location"}
          </button>

          <button
            type="button"
            onClick={showWholeGrounds}
            className="tap-44 absolute left-3 top-[11rem] z-10 inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-[13px] font-bold lg:top-[4.25rem]"
            style={{
              color: "var(--app-ink)",
              background: "var(--app-bg-elevated-solid)",
              borderColor: "var(--app-control-border)",
              boxShadow: "var(--app-elev-1)",
            }}
          >
            <Scan className="h-4 w-4" aria-hidden />
            Whole grounds
          </button>

          {selected ? (
            <div
              id="fair-map-selection-mobile"
              data-fair-map-selection
              className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 right-3 mx-auto max-h-[calc(100dvh-5.25rem-env(safe-area-inset-bottom))] max-w-[30rem] overflow-y-auto overscroll-contain rounded-[var(--app-radius-lg)] border p-4 lg:hidden"
              style={{
                zIndex: "calc(var(--z-sticky) + 1)",
                borderColor: "var(--app-control-border)",
                borderTopColor: selectedTone,
                borderTopWidth: "4px",
                background: "var(--app-bg-elevated-solid)",
                boxShadow:
                  "var(--app-elev-3), var(--app-edge), var(--app-hi)",
              }}
              role="region"
              aria-labelledby="fair-map-selection-mobile-heading"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                closeSelection();
              }}
            >
              <button
                type="button"
                onClick={closeSelection}
                className="tap-44 absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full"
                aria-label="Close selected map place"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <p
                className="pr-10 text-[12px] font-bold uppercase tracking-[0.1em]"
                style={{ color: selectedTone }}
              >
                {fairGroundsMapKindLabel(selected.properties.kind)}
              </p>
              <h3
                id="fair-map-selection-mobile-heading"
                ref={mobileSelectionHeadingRef}
                tabIndex={-1}
                className="mt-1 pr-10 text-[22px] font-extrabold leading-tight tracking-[-0.03em] outline-none"
              >
                <span className="sr-only">Selected map place: </span>
                {mappedFeatureName(selected, mapData)}
              </h3>
              <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--app-ink-3)" }}>
                {selectedProgramItems.length > 0
                  ? `${selectedProgramItems.length} ${selectedProgramItems.length === 1 ? "event" : "events"} here on your day`
                  : (locationPrecisionLabel(
                      selected.properties.locationPrecision,
                    ) ?? "Reviewed Fair map place")}
              </p>
              {selected.properties.detail ? (
                <p
                  className="mt-2 text-[14px] leading-relaxed"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {selected.properties.detail}
                </p>
              ) : null}
              <FairMapFeatureActions feature={selected} />
              <button
                type="button"
                aria-expanded={selectionExpanded}
                aria-controls="fair-map-selection-mobile-details"
                onClick={() => setSelectionExpanded((current) => !current)}
                className="tap-44 mt-1 inline-flex min-h-11 items-center gap-1 text-[13px] font-bold"
                style={{ color: selectedTone }}
              >
                {selectionExpanded ? "Show less" : "More details"}
                <ChevronDown
                  className={`h-4 w-4 transition-transform motion-reduce:transition-none ${selectionExpanded ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              <div
                id="fair-map-selection-mobile-details"
                className={selectionExpanded ? "block" : "hidden"}
              >
              {selectedStops.length > 0 ? (
                <p
                  className="mt-2 text-[14px] font-semibold"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  Saved in My Day: {selectedStops.map((stop) => stop.title).join(", ")}
                </p>
              ) : null}
              {selectedProgramItems.length > 0 ? (
                <div
                  className="mt-3 border-l-2 pl-3"
                  style={{ borderColor: "var(--app-amber)" }}
                >
                  <p
                    className="text-[13px] font-bold uppercase tracking-[0.09em]"
                    style={{ color: "var(--app-warning-press)" }}
                  >
                    On your selected day
                  </p>
                  {selectedProgramItems.slice(0, 2).map((item) => (
                    <p key={item.id} className="mt-1 text-[14px] font-semibold leading-snug">
                      <span className="tabular-nums" style={{ color: "var(--app-brand-press)" }}>
                        {item.timeLabel}
                      </span>{" "}
                      · {item.title}
                    </p>
                  ))}
                  {selectedProgramItems.length > 2 ? (
                    <button
                      type="button"
                      onClick={browseProgram}
                      className="tap-44 mt-1 inline-flex min-h-11 items-center text-[13px] font-bold"
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
                  className="tap-44 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-bold"
                  style={{ color: "var(--app-brand-press)" }}
                >
                    <MessageSquareWarning className="h-4 w-4" aria-hidden />
                    Report issue
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <aside
          id={selected ? "fair-map-selection-desktop" : undefined}
          data-fair-map-selection={selected ? "" : undefined}
          className="relative z-10 mx-2 -mt-4 hidden rounded-[var(--app-radius-xl)] border p-4 lg:mx-0 lg:mt-0 lg:flex lg:min-h-[620px] lg:flex-col lg:p-5"
          style={{
            borderColor: "var(--app-control-border)",
            borderTopColor: selected ? selectedTone : "var(--app-brand-press)",
            borderTopWidth: "4px",
            background: "var(--app-bg-elevated-solid)",
            boxShadow: "var(--app-elev-2), var(--app-edge), var(--app-hi)",
          }}
          aria-labelledby={
            selected
              ? "fair-map-selection-desktop-heading"
              : "fair-map-guidance-heading"
          }
          onKeyDown={(event) => {
            if (!selected || event.key !== "Escape") return;
            event.preventDefault();
            closeSelection();
          }}
        >
          {selected ? (
            <>
              <button
                type="button"
                onClick={closeSelection}
                className="tap-44 absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full"
                aria-label="Close selected map place"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <p className="pr-11 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: selectedTone }}>
                {fairGroundsMapKindLabel(selected.properties.kind)}
              </p>
              <h3
                id="fair-map-selection-desktop-heading"
                ref={desktopSelectionHeadingRef}
                tabIndex={-1}
                className="mt-1 pr-11 text-[22px] font-extrabold leading-tight tracking-[-0.035em] outline-none"
              >
                <span className="sr-only">Selected map place: </span>
                {mappedFeatureName(selected, mapData)}
              </h3>
              <p
                className="mt-2 text-[12px] font-bold uppercase tracking-[0.08em]"
                style={{ color: "var(--app-ink-3)" }}
              >
                {locationPrecisionLabel(
                  selected.properties.locationPrecision,
                ) ?? "Reviewed Fair map place"}
              </p>
              <p
                className="mt-3 text-[14px] leading-relaxed"
                style={{ color: "var(--app-ink-2)" }}
              >
                {selected.properties.detail ??
                  "Use this mapped landmark to orient yourself. Radius does not infer an indoor entrance or walking route."}
              </p>
              <FairMapFeatureActions feature={selected} />
              {selectedStops.length > 0 ? (
                <div className="mt-4 border-l-2 pl-3" style={{ borderColor: "var(--app-brand)" }}>
                  <p className="text-[13px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--app-brand-press)" }}>
                    In My Day
                  </p>
                  {selectedStops.map((stop) => (
                    <p key={stop.id} className="mt-1 text-[14px] font-semibold leading-snug">
                      {stop.title}
                    </p>
                  ))}
                </div>
              ) : null}
              {selectedProgramItems.length > 0 ? (
                <div
                  className="mt-4 border-l-2 pl-3"
                  style={{ borderColor: "var(--app-amber)" }}
                >
                  <p
                    className="text-[13px] font-bold uppercase tracking-[0.09em]"
                    style={{ color: "var(--app-warning-press)" }}
                  >
                    On your selected day
                  </p>
                  {selectedProgramItems.slice(0, 3).map((item) => (
                    <p key={item.id} className="mt-2 text-[14px] font-semibold leading-snug">
                      <span className="tabular-nums" style={{ color: "var(--app-brand-press)" }}>
                        {item.timeLabel}
                      </span>{" "}
                      · {item.title}
                    </p>
                  ))}
                  {selectedProgramItems.length > 3 ? (
                    <button
                      type="button"
                      onClick={browseProgram}
                      className="tap-44 mt-2 inline-flex min-h-11 items-center text-[13px] font-bold"
                      style={{ color: "var(--app-cool)" }}
                    >
                      See {selectedProgramItems.length - 3} more in Program
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--app-brand-press)" }}>
                Your bearings
              </p>
              <h3 id="fair-map-guidance-heading" className="mt-1 text-[22px] font-extrabold leading-tight tracking-[-0.035em]">
                Tap a marker, not a directory.
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                Start with gates, restrooms, and show areas. Switch the layer when you want animals, buildings, parking, or published transit stops.
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
            <p className="mt-4 text-[14px] font-semibold leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {mappedSavedStopIds.size} of {savedStops.length} saved {savedStops.length === 1 ? "stop has" : "stops have"} reviewed map geometry. Radius leaves the rest unpinned rather than guessing.
            </p>
          ) : null}

          {savedCar && savedCar.latitude === null ? (
            <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Saved car: {savedCar.lotLabel ?? "note only"}. Save a precise location in Travel to place it on this map.
            </p>
          ) : null}

          <div className="mt-4 border-t pt-3 lg:mt-auto" style={{ borderColor: "var(--app-border)" }}>
            <button
              type="button"
              onClick={() => reportMapIssue(selected)}
              className="tap-44 inline-flex min-h-11 items-center gap-2 text-[13px] font-bold"
              style={{ color: "var(--app-brand-press)" }}
            >
              <MessageSquareWarning className="h-4 w-4" aria-hidden />
              Report a map issue
            </button>
            <p
              className="mt-2 text-[12px] leading-relaxed"
              style={{ color: "var(--app-ink-3)" }}
            >
              Grounds geometry: {" "}
              <a
                href={mapData.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {mapData.source.publisher}, {mapData.source.license}
              </a>
              . Official arrival and transit details link to their own sources.
              Follow current on-site signs.
            </p>
          </div>
        </aside>
      </div>

      {locationStatus ? (
        <p
          className="mt-3 border-l-2 py-1 pl-3 text-[14px] font-semibold leading-relaxed"
          style={{ borderColor: "var(--app-cool)", color: "var(--app-ink-2)" }}
        >
          {locationStatus}
        </p>
      ) : null}

      <details
        className="mt-4 overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{
          borderColor: "var(--app-control-border)",
          background: "var(--app-bg-elevated-solid)",
        }}
      >
        <summary className="tap-44 flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-[14px] font-bold">
          <span>Find places by task</span>
          <span
            className="tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
            aria-label={`${accessibleFeatures.length + (savedCar !== null && savedCar.latitude !== null && savedCar.longitude !== null ? 1 : 0)} places`}
          >
            {accessibleFeatures.length +
              (savedCar !== null &&
              savedCar.latitude !== null &&
              savedCar.longitude !== null
                ? 1
                : 0)}
          </span>
        </summary>
        <ul
          className="border-t"
          style={{ borderColor: "var(--app-border)" }}
          aria-label="Mapped places grouped by task"
        >
          {groupedAccessibleFeatures.map((group) => (
            <li
              key={group.id}
              className="border-b p-2 last:border-b-0"
              style={{ borderColor: "var(--app-border)" }}
            >
              <section aria-labelledby={`fair-map-list-${group.id}`}>
                <div className="px-3 pb-1.5 pt-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3
                      id={`fair-map-list-${group.id}`}
                      className="text-[14px] font-bold"
                    >
                      {group.label}
                    </h3>
                    <span
                      className="text-[12px] font-semibold tabular-nums"
                      style={{ color: "var(--app-ink-3)" }}
                      aria-hidden="true"
                    >
                      {group.features.length +
                        (group.id === "arrive" &&
                        savedCar !== null &&
                        savedCar?.longitude !== null &&
                        savedCar?.latitude !== null
                          ? 1
                          : 0)}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 text-[12px] leading-snug"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {group.detail}
                  </p>
                </div>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {group.id === "arrive" &&
                  savedCar &&
                  savedCar.longitude !== null &&
                  savedCar.latitude !== null ? (
                    <li>
                      <button
                        type="button"
                        onClick={(event) => showSavedCar(event.currentTarget)}
                        className="tap-44 flex min-h-12 w-full items-center gap-3 rounded-[var(--app-radius-md)] px-3 py-2 text-left hover:bg-[var(--app-bg-sunken)] focus-visible:bg-[var(--app-bg-sunken)]"
                      >
                        <CircleParking
                          className="h-5 w-5 shrink-0"
                          style={{ color: "var(--app-cool)" }}
                          aria-hidden
                        />
                        <span>
                          <span className="block text-[14px] font-bold">
                            Saved car
                          </span>
                          <span
                            className="block text-[12px] font-semibold"
                            style={{ color: "var(--app-ink-3)" }}
                          >
                            {savedCar.lotLabel ?? "Saved location"}
                          </span>
                        </span>
                      </button>
                    </li>
                  ) : null}
                  {group.features.map((feature) => {
                    const savedHere =
                      savedStopMatches.get(feature.properties.id) ?? [];
                    const scheduledHere =
                      programMatches.get(feature.properties.id) ?? [];
                    const selectedHere = selectedId === feature.properties.id;
                    return (
                      <li key={`list-${feature.properties.id}`}>
                        <button
                          type="button"
                          aria-pressed={selectedHere}
                          aria-controls={
                            selectedHere
                              ? "fair-map-selection-mobile fair-map-selection-desktop"
                              : undefined
                          }
                          onClick={(event) =>
                            chooseFeature(feature, event.currentTarget)
                          }
                          className="tap-44 min-h-12 w-full rounded-[var(--app-radius-md)] px-3 py-2 text-left hover:bg-[var(--app-bg-sunken)] focus-visible:bg-[var(--app-bg-sunken)]"
                          style={{
                            background: selectedHere
                              ? "var(--app-brand-tint-6)"
                              : "transparent",
                          }}
                        >
                          <span className="block text-[14px] font-bold">
                            {mappedFeatureName(feature, mapData)}
                          </span>
                          <span
                            className="block text-[12px] font-semibold leading-snug"
                            style={{ color: "var(--app-ink-3)" }}
                          >
                            {fairGroundsMapKindLabel(feature.properties.kind)}
                            {savedHere.length > 0
                              ? ` · ${savedHere.length} saved ${savedHere.length === 1 ? "stop" : "stops"}`
                              : ""}
                            {scheduledHere.length > 0
                              ? ` · ${scheduledHere.length} ${scheduledHere.length === 1 ? "program item" : "program items"}`
                              : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
