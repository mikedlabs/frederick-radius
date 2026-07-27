"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Facebook,
  Globe,
  Instagram,
  MapPin,
  Navigation,
  Utensils,
} from "lucide-react";
import type { Hours } from "@/data/places";
import type { FoodTruck } from "@/data/food-trucks";
import { truckFeedUrl } from "@/data/food-trucks";
import type { TruckBeacon } from "@/lib/food-trucks/beacon";
import { foodTruckStopDirectionsUrl } from "@/lib/food-trucks/presentation";
import type { FoodTruckScheduleStop } from "@/lib/food-trucks/schedule-types";
import BottomDrawer from "@/components/ui/BottomDrawer";
import FoodTruckIdentity from "./FoodTruckIdentity";
import TruckHomeStatus from "./TruckHomeStatus";
import TruckLiveStatus from "./TruckLiveStatus";

export type FoodTruckBoardItem = FoodTruck & {
  home?: {
    name: string;
    slug: string;
    hours?: Hours;
    verified: boolean;
  };
  beacon?: TruckBeacon;
};

type Filter = "all" | "scheduled" | "savory" | "treats";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All vendors" },
  { id: "scheduled", label: "Scheduled this week" },
  { id: "savory", label: "Meals" },
  { id: "treats", label: "Coffee & treats" },
];

function LinkButton({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Globe }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="tap-44 inline-flex items-center justify-center gap-2 rounded-full border px-3.5 py-2 text-[12px] font-semibold"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      {label}
    </a>
  );
}

function formatStopDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function formatStopTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatStopTimeRange(stop: FoodTruckScheduleStop): string {
  const start = formatStopTime(stop.startsAt);
  return stop.endsAt ? `${start}–${formatStopTime(stop.endsAt)}` : start;
}

type VendorAction = {
  href: string;
  label: string;
  icon: typeof Globe;
};

function vendorActions(truck: FoodTruckBoardItem): VendorAction[] {
  const feed = truckFeedUrl(truck);
  const candidates: Array<VendorAction | null> = [
    feed ? { href: feed, label: "Latest location", icon: Navigation } : null,
    truck.menuUrl ? { href: truck.menuUrl, label: "Menu", icon: Utensils } : null,
    truck.bookingUrl ? { href: truck.bookingUrl, label: "Book this truck", icon: CalendarDays } : null,
    truck.website ? { href: truck.website, label: "Website", icon: Globe } : null,
    truck.instagram ? { href: truck.instagram, label: "Instagram", icon: Instagram } : null,
    truck.facebook ? { href: truck.facebook, label: "Facebook", icon: Facebook } : null,
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate): candidate is VendorAction => {
    if (!candidate || seen.has(candidate.href)) return false;
    seen.add(candidate.href);
    return true;
  });
}

export default function FoodTruckBoard({
  trucks,
  stops,
  accent,
}: {
  trucks: FoodTruckBoardItem[];
  stops: FoodTruckScheduleStop[];
  accent: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  /**
   * `/food-trucks#truck-<slug>` is the link a vendor shares for their own
   * listing, and the stop cards link to it too. The roster renders only the
   * first 8 cards until "Show all", so for any vendor past the eighth the
   * anchor pointed at a node that did not exist and the jump silently did
   * nothing. Expand (and clear a filter that would hide them) before scrolling.
   */
  useEffect(() => {
    const focusHashTruck = () => {
      const match = /^#truck-(.+)$/.exec(window.location.hash);
      if (!match) return;
      const slug = decodeURIComponent(match[1]);
      if (!trucks.some((truck) => truck.slug === slug)) return;
      setFilter("all");
      setShowAll(true);
      // Two frames: one for the expanded list to commit, one for layout.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById(`truck-${slug}`)?.scrollIntoView({ block: "center" });
        });
      });
    };
    focusHashTruck();
    window.addEventListener("hashchange", focusHashTruck);
    return () => window.removeEventListener("hashchange", focusHashTruck);
  }, [trucks]);

  const scheduledSlugs = useMemo(
    () => new Set(stops.flatMap((stop) => stop.vendors.map((item) => item.slug).filter(Boolean) as string[])),
    [stops],
  );
  const filtered = trucks.filter((truck) => {
    if (filter === "scheduled") return scheduledSlugs.has(truck.slug);
    if (filter === "savory") return truck.kind === "food" && !/coffee/i.test(truck.cuisine);
    if (filter === "treats") return truck.kind === "treats" || /coffee|smoothie|acai/i.test(truck.cuisine);
    return true;
  });
  const visible = filter === "scheduled" || showAll ? filtered : filtered.slice(0, 8);
  const selected = trucks.find((truck) => truck.slug === selectedSlug) ?? null;
  const selectedStops = selected
    ? stops.filter((stop) => stop.vendors.some((item) => item.slug === selected.slug))
    : [];
  const selectedActions = selected ? vendorActions(selected) : [];

  return (
    <>
      <section id="vendors" className="scroll-mt-24 space-y-4">
        <div className="flex items-end justify-between gap-4 border-b pb-3" style={{ borderColor: "var(--app-border)" }}>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>
              Meet the trucks
            </p>
            <h2 className="mt-1 font-serif text-[28px] leading-none tracking-tight" style={{ color: "var(--app-ink)" }}>
              Browse the local roster
            </h2>
          </div>
          <span className="font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>
            {visible.length === filtered.length
              ? `${filtered.length} vendors`
              : `${visible.length} of ${filtered.length}`}
          </span>
        </div>

        <div className="shelf-rail -mx-4 gap-2 px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter food-truck vendors">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setFilter(item.id);
                  setShowAll(false);
                }}
                aria-pressed={active}
                className="tap-44 shrink-0 rounded-full border px-3.5 py-2 text-[12px] font-semibold"
                style={{
                  borderColor: active ? "var(--app-ink)" : "var(--app-border)",
                  background: active ? "var(--app-ink)" : "var(--app-bg-elevated)",
                  color: active ? "var(--app-bg)" : "var(--app-ink)",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {filtered.length > 0 ? (
          <ul className="food-truck-vendor-grid">
            {visible.map((truck) => {
              const next = stops.find((stop) => stop.vendors.some((item) => item.slug === truck.slug));
              return (
                <li key={truck.slug} id={`truck-${truck.slug}`} className="food-truck-vendor-card">
                  <FoodTruckIdentity truck={truck} decorative />
                  <div className="flex min-w-0 flex-1 flex-col p-3.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: accent }}>
                      {truck.cuisine}
                    </p>
                    <h3 className="mt-1 font-serif text-[20px] font-semibold leading-[1.05]" style={{ color: "var(--app-ink)" }}>
                      {truck.name}
                    </h3>
                    {truck.beacon ? (
                      <TruckLiveStatus beacon={truck.beacon} accent={accent} />
                    ) : next ? (
                      <div className="mt-2 space-y-0.5">
                        <p className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
                          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {formatStopDay(next.startsAt)} at {formatStopTime(next.startsAt)}
                        </p>
                        <p className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                          <MapPin className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                          <span className="line-clamp-1">{next.venueName}</span>
                        </p>
                      </div>
                    ) : truck.home ? (
                      <TruckHomeStatus
                        venueName={truck.home.name}
                        venueSlug={truck.home.slug}
                        hours={truck.home.hours}
                        verified={truck.home.verified}
                        accent={accent}
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelectedSlug(truck.slug)}
                      className="tap-44 mt-auto inline-flex items-center justify-between gap-2 pt-3 text-left text-[12px] font-semibold"
                      style={{ color: "var(--app-ink)" }}
                      aria-label={`See details for ${truck.name}`}
                    >
                      See details
                      <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-[var(--app-radius-lg)] border px-4 py-8 text-center" style={{ borderColor: "var(--app-border)" }}>
            <p className="font-serif text-[20px]" style={{ color: "var(--app-ink)" }}>No published stops are on the board yet.</p>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>Try another filter or check each vendor&rsquo;s latest post.</p>
          </div>
        )}

        {filter !== "scheduled" && filtered.length > 8 ? (
          <button
            type="button"
            onClick={() => setShowAll((current) => !current)}
            className="tap-44 mx-auto flex items-center justify-center rounded-full border px-4 py-2.5 text-[12px] font-semibold"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
          >
            {showAll ? "Show fewer vendors" : `Show all ${filtered.length} vendors`}
          </button>
        ) : null}
      </section>

      <BottomDrawer
        open={Boolean(selected)}
        onOpenChange={(open) => { if (!open) setSelectedSlug(null); }}
        title={selected?.name ?? "Food-truck details"}
        subtitle={selected?.cuisine}
      >
        {selected ? (
          <div className="space-y-5 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-6">
            <div className="-mx-4 -mt-4 overflow-hidden border-b sm:-mx-6" style={{ borderColor: "var(--app-border)" }}>
              <FoodTruckIdentity truck={selected} size="detail" decorative />
            </div>

            <div className="min-w-0">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: accent }}>
                {selected.serviceModel === "resident"
                  ? "Resident kitchen"
                  : selected.kind === "treats"
                    ? "Treat truck"
                    : "Mobile kitchen"}
              </p>
              <p className="mt-1 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                {selected.blurb ?? `${selected.name} serves ${selected.cuisine.toLowerCase()} around Frederick County.`}
              </p>
            </div>

            {selected.beacon ? (
              <TruckLiveStatus beacon={selected.beacon} accent={accent} />
            ) : selected.home ? (
              <TruckHomeStatus
                venueName={selected.home.name}
                venueSlug={selected.home.slug}
                hours={selected.home.hours}
                verified={selected.home.verified}
                accent={accent}
              />
            ) : null}

            {selectedStops.length > 0 ? (
              <section className="rounded-[var(--app-radius-lg)] border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}>
                <h4 className="inline-flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  Published this week
                </h4>
                <div className="mt-3 space-y-3">
                  {selectedStops.map((stop) => (
                    <div key={stop.id} className="border-t pt-3 first:border-0 first:pt-0" style={{ borderColor: "var(--app-border)" }}>
                      <p className="text-[12.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
                        {formatStopDay(stop.startsAt)} · {formatStopTimeRange(stop)}
                      </p>
                      <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-ink-2)" }}>{stop.venueName}</p>
                      {stop.address ? (
                        <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>{stop.address}</p>
                      ) : null}
                      <a
                        href={foodTruckStopDirectionsUrl(stop)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tap-44-y mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold underline"
                        style={{ color: accent }}
                      >
                        Directions
                        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      </a>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {selected.dietary?.length ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>Vendor-listed options</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.dietary.map((item) => (
                    <span key={item} className="rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>{item}</span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              {selectedActions.map((action) => (
                <LinkButton
                  key={`${action.label}-${action.href}`}
                  href={action.href}
                  label={action.label}
                  icon={action.icon}
                />
              ))}
            </div>

            <p className="text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              Schedules can change. Use the vendor&rsquo;s latest location link before making a special trip.
            </p>
            <div className="rounded-[var(--app-radius-md)] border p-3.5" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                Own this truck or know a listing detail that changed?
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <Link
                  href={`/food-trucks/claim?truck=${encodeURIComponent(selected.slug)}`}
                  className="tap-44-y inline-flex items-center text-[12px] font-semibold underline"
                  style={{ color: accent }}
                >
                  Claim this truck
                </Link>
                <Link
                  href="/submit/place?category=food-truck"
                  className="tap-44-y inline-flex items-center text-[12px] font-semibold underline"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  Suggest an update or add a photo
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </BottomDrawer>
    </>
  );
}
