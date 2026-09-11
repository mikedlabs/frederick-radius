"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { Hours } from "@/data/places";
import {
  FREDERICK_CENTER,
  formatDistance,
  haversineMeters,
  type LngLat,
} from "@/lib/geo";
import { formatHoursLine, getOpenStatus } from "@/lib/hours";
import { track } from "@/lib/track";

type Service = "wash" | "lube" | "repair";

export type WlrConceptLocation = {
  slug: string;
  name: string;
  service: Service;
  address: string;
  phone: string;
  website: string;
  geom: LngLat;
  hours?: Hours;
  hoursVerified: boolean;
  blurb: string;
};

const SERVICES: ReadonlyArray<{
  key: Service;
  letter: string;
  label: string;
  prompt: string;
  detail: string;
}> = [
  {
    key: "wash",
    letter: "W",
    label: "Wash",
    prompt: "The car needs a wash.",
    detail: "Choose an express or full-service wash.",
  },
  {
    key: "lube",
    letter: "L",
    label: "Lube",
    prompt: "It is time for an oil change.",
    detail: "Drive through without an appointment.",
  },
  {
    key: "repair",
    letter: "R",
    label: "Repair",
    prompt: "Something needs attention.",
    detail: "Get repair, diagnostics, or a state inspection.",
  },
];

const ROUTE_CLUSTERS = [
  {
    label: "Route 40",
    note: "Oil change and repair share one address. The full-service wash is about half a mile away.",
  },
  {
    label: "Route 85",
    note: "The Lube Center and Auto Spa Express are across Buckeystown Pike from each other.",
  },
] as const;

/** WLR owns a deliberately distinct preview palette. Keep those colors local
 * to this concept, but name every role so the component never grows a second
 * set of one-off color utilities. The values are unchanged from the approved
 * preview artwork. */
const WLR_THEME_STYLE = {
  "--wlr-canvas": "#F5F1E8", // unslop-ignore -- approved WLR paper paired with its navy and yellow identity
  "--wlr-surface": "#F9F7F1",
  "--wlr-surface-warm": "#ECE6DA",
  "--wlr-ink": "#14213D",
  "--wlr-navy": "#162F65",
  "--wlr-blue": "#0C4D8F",
  "--wlr-accent": "#F8DE08",
  "--wlr-muted": "#475467",
  "--wlr-subtle": "#667085",
  "--wlr-divider": "#98A2B3",
  "--wlr-white": "#FFFFFF",
  "--wlr-status-open": "#0B6B45",
  "--wlr-status-closing": "#834000",
  "--wlr-status-closed": "#8A2F2F",
  "--wlr-navy-05": "rgba(22,47,101,.05)",
  "--wlr-navy-10": "rgba(22,47,101,.10)",
  "--wlr-navy-12": "rgba(22,47,101,.12)",
  "--wlr-navy-14": "rgba(22,47,101,.14)",
  "--wlr-navy-15": "rgba(22,47,101,.15)",
  "--wlr-navy-18": "rgba(22,47,101,.18)",
  "--wlr-navy-20": "rgba(22,47,101,.20)",
  "--wlr-navy-72": "rgba(22,47,101,.72)",
  "--wlr-white-055": "rgba(255,255,255,.055)",
  "--wlr-white-14": "rgba(255,255,255,.14)",
  "--wlr-white-18": "rgba(255,255,255,.18)",
  "--wlr-white-58": "rgba(255,255,255,.58)",
  "--wlr-white-68": "rgba(255,255,255,.68)",
  "--wlr-white-70": "rgba(255,255,255,.70)",
  "--wlr-white-78": "rgba(255,255,255,.78)",
  "--wlr-white-80": "rgba(255,255,255,.80)",
  "--wlr-shadow-hero": "0 24px 80px rgba(22,47,101,.20)",
  "--wlr-shadow-card": "0 20px 60px rgba(4,12,30,.28)",
} as CSSProperties;

function directionsUrl(location: WlrConceptLocation): string {
  const destination = encodeURIComponent(
    `${location.geom.lat},${location.geom.lng}`,
  );
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

function statusTone(state: ReturnType<typeof getOpenStatus>["state"]): string {
  if (state === "open") return "var(--wlr-status-open)";
  if (state === "closing-soon") return "var(--wlr-status-closing)";
  if (state === "closed") return "var(--wlr-status-closed)";
  return "var(--wlr-muted)";
}

export default function WlrRoadReady({
  locations,
}: {
  locations: WlrConceptLocation[];
}) {
  const [service, setService] = useState<Service>("wash");
  const [position, setPosition] = useState<LngLat | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const matches = useMemo(() => {
    const origin = position ?? FREDERICK_CENTER;
    return locations
      .filter((location) => location.service === service)
      .map((location) => ({
        ...location,
        distanceM: haversineMeters(origin, location.geom),
        status: getOpenStatus(
          location.hours,
          { verified: location.hoursVerified },
        ),
      }))
      .sort((a, b) => a.distanceM - b.distanceM);
  }, [locations, position, service]);

  const lead = matches[0];
  const serviceMeta =
    SERVICES.find((candidate) => candidate.key === service) ?? SERVICES[0];

  const useLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("This browser cannot share a location.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setPosition({
          lng: result.coords.longitude,
          lat: result.coords.latitude,
        });
        setLocating(false);
        track("wlr_concept_location", { result: "shared" });
      },
      () => {
        setLocating(false);
        setLocationError(
          "Location was not shared. The page is still ordered from central Frederick.",
        );
        track("wlr_concept_location", { result: "unavailable" });
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 120_000 },
    );
  };

  const chooseService = (next: Service) => {
    setService(next);
    setShowAll(false);
    track("wlr_concept_service", { service: next });
  };

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-dvh overflow-hidden bg-[var(--wlr-canvas)] text-[var(--wlr-ink)]"
      style={WLR_THEME_STYLE}
    >
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-12 pt-4 sm:px-7 sm:pb-20 sm:pt-6">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--wlr-navy-15)] pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center bg-[var(--wlr-navy)] text-[12px] font-black tracking-[-0.04em] text-[var(--wlr-white)]">
              WLR
            </span>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--wlr-navy)]">
                Road Ready
              </p>
              <p className="text-[11px] text-[var(--wlr-muted)]">
                A Frederick Radius concept
              </p>
            </div>
          </div>
          <span className="border border-[var(--wlr-navy-20)] bg-[var(--wlr-white-70)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--wlr-navy)]">
            Discussion preview
          </span>
        </header>

        <section className="relative mt-5 overflow-hidden bg-[var(--wlr-navy)] px-5 py-7 text-[var(--wlr-white)] shadow-[var(--wlr-shadow-hero)] sm:px-9 sm:py-10 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(370px,.95fr)] lg:gap-12 lg:px-12 lg:py-12">
          <div className="road-ready-grid" aria-hidden />
          <div className="relative z-10 lg:col-start-1 lg:row-start-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--wlr-accent)]">
              Seven Frederick locations
            </p>
            <h1 className="mt-3 max-w-[720px] text-balance font-serif text-[42px] font-semibold leading-[0.96] tracking-[-0.045em] sm:text-[62px] lg:text-[72px]">
              Car care, without the hunt.
            </h1>
            <p className="mt-4 max-w-[54ch] text-[15px] leading-6 text-[var(--wlr-white-78)] sm:text-[17px] sm:leading-7">
              Choose the job. Radius finds the closest WLR location that does
              it and gives you one clear next move.
            </p>

            <div
              className="mt-7 grid grid-cols-3 gap-2 sm:gap-3"
              role="group"
              aria-label="Choose a car-care service"
            >
              {SERVICES.map((item) => {
                const active = item.key === service;
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => chooseService(item.key)}
                    className="group min-h-[112px] border p-3 text-left transition duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wlr-accent)] sm:min-h-[132px] sm:p-4"
                    style={{
                      borderColor: active
                        ? "var(--wlr-accent)"
                        : "var(--wlr-white-18)",
                      background: active
                        ? "var(--wlr-accent)"
                        : "var(--wlr-white-055)",
                      color: active
                        ? "var(--wlr-navy)"
                        : "var(--wlr-white)",
                      transform: active ? "translateY(-3px)" : "none",
                    }}
                  >
                    <span className="block text-[34px] font-black leading-none tracking-[-0.07em] sm:text-[46px]">
                      {item.letter}
                    </span>
                    <span className="mt-3 block text-[11px] font-extrabold uppercase tracking-[0.13em] sm:text-[12px]">
                      {item.label}
                    </span>
                    <span
                      className="mt-1 hidden text-[11px] leading-4 sm:block"
                      style={{
                        color: active
                          ? "var(--wlr-navy-72)"
                          : "var(--wlr-white-58)",
                      }}
                    >
                      {item.detail}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative z-10 mt-7 self-end lg:col-start-2 lg:row-start-1 lg:mt-0">
            <div className="border border-[var(--wlr-white-14)] bg-[var(--wlr-surface)] p-4 text-[var(--wlr-ink)] shadow-[var(--wlr-shadow-card)] sm:p-6">
              <div className="flex items-start justify-between gap-4 border-b border-[var(--wlr-navy-12)] pb-4">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[var(--wlr-blue)]">
                    {position ? "Closest to you" : "Starting in central Frederick"}
                  </p>
                  <p className="mt-1 text-[14px] font-semibold text-[var(--wlr-navy)]">
                    {serviceMeta.prompt}
                  </p>
                </div>
                <span className="text-[36px] font-black leading-none tracking-[-0.08em] text-[var(--wlr-navy-12)]">
                  {serviceMeta.letter}
                </span>
              </div>

              {lead ? (
                <>
                  <div className="pt-5">
                    <div className="flex items-center gap-2 text-[12px] font-semibold">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: statusTone(lead.status.state) }}
                        aria-hidden
                      />
                      <span style={{ color: statusTone(lead.status.state) }}>
                        {formatHoursLine(lead.status)}
                      </span>
                      <span className="text-[var(--wlr-divider)]" aria-hidden>
                        ·
                      </span>
                      <span className="text-[var(--wlr-subtle)]">
                        {position
                          ? `${formatDistance(lead.distanceM)} away`
                          : "Ranked from central Frederick"}
                      </span>
                    </div>
                    <h2 className="mt-3 text-balance font-serif text-[30px] font-semibold leading-[1.02] tracking-[-0.035em] text-[var(--wlr-ink)] sm:text-[36px]">
                      {lead.name}
                    </h2>
                    <p className="mt-3 flex items-start gap-2 text-[13px] leading-5 text-[var(--wlr-subtle)]">
                      <MapPin
                        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--wlr-blue)]"
                        strokeWidth={2}
                        aria-hidden
                      />
                      {lead.address}
                    </p>
                    <p className="mt-3 text-[13px] leading-5 text-[var(--wlr-muted)]">
                      {lead.blurb}
                    </p>
                  </div>

                  <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
                    <a
                      href={directionsUrl(lead)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() =>
                        track("wlr_concept_action", {
                          action: "directions",
                          service,
                          slug: lead.slug,
                        })
                      }
                      className="inline-flex min-h-12 items-center justify-center gap-2 bg-[var(--wlr-navy)] px-4 text-[13px] font-bold text-[var(--wlr-white)] transition hover:bg-[var(--wlr-blue)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wlr-navy)]"
                    >
                      <Navigation className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                      Get directions
                    </a>
                    <a
                      href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}
                      aria-label={`Call ${lead.name} at ${lead.phone}`}
                      onClick={() =>
                        track("wlr_concept_action", {
                          action: "call",
                          service,
                          slug: lead.slug,
                        })
                      }
                      className="grid min-h-12 min-w-12 place-items-center border border-[var(--wlr-navy-20)] bg-[var(--wlr-white)] text-[var(--wlr-navy)] transition hover:bg-[var(--wlr-navy-05)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wlr-navy)]"
                    >
                      <Phone className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                    </a>
                  </div>
                </>
              ) : (
                <p className="py-10 text-sm text-[var(--wlr-subtle)]">
                  No matching location is available in this concept.
                </p>
              )}

              <div className="mt-4 border-t border-[var(--wlr-navy-12)] pt-4">
                <button
                  type="button"
                  onClick={position ? () => setPosition(null) : useLocation}
                  disabled={locating}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 border border-[var(--wlr-navy-18)] bg-transparent px-3 text-[12px] font-bold text-[var(--wlr-navy)] transition hover:bg-[var(--wlr-navy-05)] disabled:cursor-wait disabled:opacity-60"
                >
                  {position ? (
                    <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden />
                  ) : (
                    <LocateFixed className="h-4 w-4" strokeWidth={2} aria-hidden />
                  )}
                  {position
                    ? "Return to the Frederick overview"
                    : locating
                      ? "Finding your location…"
                      : "Use my location"}
                </button>
                {locationError && (
                  <p
                    role="status"
                    className="mt-2 text-[11px] leading-4 text-[var(--wlr-subtle)]"
                  >
                    {locationError}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="border border-[var(--wlr-navy-14)] bg-[var(--wlr-white-80)] p-5 sm:p-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[var(--wlr-blue)]">
                  The local network
                </p>
                <h2 className="mt-1 font-serif text-[28px] font-semibold tracking-[-0.03em] text-[var(--wlr-ink)]">
                  {matches.length} {serviceMeta.label.toLowerCase()}{" "}
                  {matches.length === 1 ? "location" : "locations"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAll((current) => !current)}
                aria-expanded={showAll}
                aria-controls="wlr-location-list"
                className="inline-flex min-h-11 items-center gap-2 px-2 text-[12px] font-bold text-[var(--wlr-navy)]"
              >
                {showAll ? "Show less" : "Show all"}
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showAll ? "rotate-180" : ""}`}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
            </div>

            <ol
              id="wlr-location-list"
              className="mt-5 divide-y divide-[var(--wlr-navy-10)] border-y border-[var(--wlr-navy-10)]"
            >
              {(showAll ? matches : matches.slice(0, 2)).map((location, index) => (
                <li
                  key={location.slug}
                  className="grid grid-cols-[34px_1fr_auto] items-center gap-3 py-4"
                >
                  <span className="font-mono text-[11px] font-bold text-[var(--wlr-subtle)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-[var(--wlr-ink)]">
                      {location.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--wlr-subtle)]">
                      {position
                        ? `${formatDistance(location.distanceM)} away`
                        : location.address}
                    </p>
                  </div>
                  <a
                    href={directionsUrl(location)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Get directions to ${location.name}`}
                    className="grid h-10 w-10 place-items-center text-[var(--wlr-blue)] transition hover:bg-[var(--wlr-navy-05)]"
                  >
                    <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                  </a>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[10px] leading-4 text-[var(--wlr-subtle)]">
              Posted weekly hours were checked against WLR’s location pages.
              Holiday hours may differ.
            </p>
          </div>

          <aside className="relative overflow-hidden bg-[var(--wlr-blue)] p-5 text-[var(--wlr-white)] sm:p-7">
            <Sparkles
              className="absolute right-5 top-5 h-5 w-5 text-[var(--wlr-accent)]"
              strokeWidth={1.8}
              aria-hidden
            />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[var(--wlr-accent)]">
              One trip can do more
            </p>
            <h2 className="mt-2 max-w-[12ch] font-serif text-[30px] font-semibold leading-[1.02] tracking-[-0.035em]">
              Pair the stops that belong together.
            </h2>
            <div className="mt-6 space-y-5">
              {ROUTE_CLUSTERS.map((cluster) => (
                <div key={cluster.label} className="border-t border-[var(--wlr-white-18)] pt-4">
                  <p className="flex items-center gap-2 text-[12px] font-bold text-[var(--wlr-white)]">
                    <Check className="h-4 w-4 text-[var(--wlr-accent)]" strokeWidth={2.4} aria-hidden />
                    {cluster.label}
                  </p>
                  <p className="mt-2 text-[12px] leading-5 text-[var(--wlr-white-68)]">
                    {cluster.note}
                  </p>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="mt-5 border border-[var(--wlr-navy-14)] bg-[var(--wlr-surface-warm)] p-5 sm:p-7">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[var(--wlr-blue)]">
            Why this belongs in Radius
          </p>
          <p className="mt-2 max-w-[74ch] font-serif text-[26px] font-semibold leading-[1.12] tracking-[-0.025em] text-[var(--wlr-ink)] sm:text-[32px]">
            It works because it behaves like a service, not a banner.
          </p>
          <p className="mt-3 max-w-[76ch] text-[13px] leading-6 text-[var(--wlr-muted)] sm:text-[14px]">
            The placement appears when someone needs car care, uses verified
            location data, and can be measured by useful actions such as
            directions and calls. Organic Radius results would still be ranked
            by service match, distance, availability, and freshness.
          </p>
        </section>

        <footer className="mt-8 border-t border-[var(--wlr-navy-15)] pt-4 text-[10px] leading-4 text-[var(--wlr-muted)]">
          This concept was prepared for discussion. WLR Automotive Group does
          not currently sponsor or endorse Frederick Radius. No live wait
          times, service-bay availability, or prices are claimed here.
        </footer>
      </div>

    </main>
  );
}
