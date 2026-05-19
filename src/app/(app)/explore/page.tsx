import type { Metadata } from "next";
import {
  ChevronRight,
  Trees,
  Mountain,
  Landmark,
  Palette,
  Apple,
  Droplets,
  Train,
  MapPin,
  Activity,
  Disc,
  Route,
} from "lucide-react";
import { TOP_CATEGORIES } from "@/data/categories";
import { MUNICIPALITIES } from "@/data/municipalities";
import CategoryIcon from "@/components/place/CategoryIcon";
import MunicipalityStrip from "@/components/today/MunicipalityStrip";
import SectionHeading from "@/components/ui/SectionHeading";
import { Surface } from "@/components/ui/Surface";

export const metadata: Metadata = {
  title: "Explore Frederick County",
  description:
    "Every town, every category, and the county guides. One place to find places, services, parks, trails, history, and civic information across Frederick County.",
};

export const revalidate = 3600;

// The curated, editorial county pages. These are not category list
// dumps; each is a hand-built guide. One complete sentence each, per
// STYLE.md (no fragments, no em dashes, no hype).
const GUIDES: {
  href: string;
  label: string;
  desc: string;
  icon: typeof Trees;
  color: string;
}[] = [
  { href: "/parks", label: "Parks", desc: "Every public park in the county sits on one map.", icon: Trees, color: "#1E6B3A" },
  { href: "/trails", label: "Trails", desc: "Hikes, towpaths, and rail-trails are listed with length and surface.", icon: Mountain, color: "#1E3A2F" },
  { href: "/historic", label: "Historic Frederick", desc: "Landmarks and districts carry the stories behind them.", icon: Landmark, color: "#7E2C6F" },
  { href: "/art", label: "Public art", desc: "Murals and sculptures form a self-guided downtown tour.", icon: Palette, color: "#9B3F8A" },
  { href: "/markets", label: "Markets", desc: "Farmers and makers markets are grouped by day and season.", icon: Apple, color: "#1E6B3A" },
  { href: "/water", label: "On the water", desc: "River levels and access show where you can get out.", icon: Droplets, color: "#2A5D8F" },
  { href: "/transit", label: "Transit", desc: "TransIT bus and MARC rail show how to get around without a car.", icon: Train, color: "#2A5D8F" },
  { href: "/amenities", label: "Public amenities", desc: "Restrooms, water, and bike parking are mapped out in public.", icon: MapPin, color: "#2A5D8F" },
  { href: "/pulse", label: "County pulse", desc: "Live signals cover alerts, air quality, and what is happening now.", icon: Activity, color: "#A02929" },
];

export default function ExplorePage() {
  const townCount = MUNICIPALITIES.length;

  return (
    <div className="space-y-7 stagger">
      {/* Page header — the single focal element */}
      <header className="space-y-1.5">
        <p className="eyebrow">All of Frederick County</p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Explore
        </h1>
        <p
          className="text-pretty text-[15px] leading-relaxed"
          style={{ color: "var(--app-ink-3)" }}
        >
          Twelve towns, every category, and the county guides. Start with
          where you are, or browse the whole county.
        </p>
      </header>

      {/* Towns — the county-wide entry the old nav had no path to */}
      <section className="space-y-3">
        <SectionHeading title="Towns" count={townCount} />
        <MunicipalityStrip />
      </section>

      {/* Browse by category — vector icons, semantic tint, real anatomy */}
      <section className="space-y-3">
        <SectionHeading title="Browse by category" />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {TOP_CATEGORIES.map((c) => (
            <Surface
              key={c.slug}
              href={`/category/${c.slug}`}
              interactive
              radius="var(--app-radius-md)"
              className="flex items-center gap-3.5 p-3.5"
            >
              <span
                aria-hidden
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                style={{
                  background: `color-mix(in srgb, ${c.color} 14%, transparent)`,
                  color: c.color,
                }}
              >
                <CategoryIcon slug={c.slug} strokeWidth={1.9} className="h-5 w-5" style={{ color: c.color }} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[15px] font-semibold tracking-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {c.name}
                </span>
                <span
                  className="block truncate text-[12.5px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {c.blurb}
                </span>
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0"
                style={{ color: "var(--app-ink-3)" }}
                aria-hidden
              />
            </Surface>
          ))}
        </div>
      </section>

      {/* County guides — the curated editorial pages, no longer orphaned */}
      <section className="space-y-3">
        <SectionHeading title="County guides" />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {GUIDES.map(({ href, label, desc, icon: Icon, color }) => (
            <Surface
              key={href}
              href={href}
              interactive
              radius="var(--app-radius-md)"
              className="flex items-center gap-3.5 p-3.5"
            >
              <span
                aria-hidden
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                style={{
                  background: `color-mix(in srgb, ${color} 14%, transparent)`,
                  color,
                }}
              >
                <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[15px] font-semibold tracking-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {label}
                </span>
                <span
                  className="block truncate text-[12.5px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {desc}
                </span>
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0"
                style={{ color: "var(--app-ink-3)" }}
                aria-hidden
              />
            </Surface>
          ))}
        </div>
      </section>

      {/* Tools — Radius and Plan stay one tap away after leaving the bar */}
      <section className="space-y-3">
        <SectionHeading title="Tools" />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Surface
            href="/radius"
            interactive
            radius="var(--app-radius-md)"
            className="flex items-center gap-3.5 p-3.5"
          >
            <span
              aria-hidden
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
              style={{ background: "color-mix(in srgb, var(--app-brand) 14%, transparent)", color: "var(--app-brand)" }}
            >
              <Disc className="h-5 w-5" strokeWidth={1.9} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                Radius
              </span>
              <span className="block truncate text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
                Set a point and a distance, then see what falls inside.
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--app-ink-3)" }} aria-hidden />
          </Surface>
          <Surface
            href="/plan"
            interactive
            radius="var(--app-radius-md)"
            className="flex items-center gap-3.5 p-3.5"
          >
            <span
              aria-hidden
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
              style={{ background: "color-mix(in srgb, var(--app-cool) 16%, transparent)", color: "var(--app-cool)" }}
            >
              <Route className="h-5 w-5" strokeWidth={1.9} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                Plan a day
              </span>
              <span className="block truncate text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
                Build a route through places and events, then save it.
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--app-ink-3)" }} aria-hidden />
          </Surface>
        </div>
      </section>
    </div>
  );
}
