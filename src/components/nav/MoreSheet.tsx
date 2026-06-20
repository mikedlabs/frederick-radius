"use client";

import Link from "next/link";
import {
  Info,
  Wrench,
  Building2,
  Bus,
  Mountain,
  Settings as SettingsIcon,
  ShieldCheck,
  Waves,
  TreeDeciduous,
  Activity,
  SquareParking,
  Route,
  Wine,
  Croissant,
  Tag,
  Plane,
  Landmark,
} from "lucide-react";
import BottomDrawer from "@/components/ui/BottomDrawer";

/**
 * MoreSheet v7 — Discover-first + app-drawer icon grids.
 *
 * v6 had a coherent layout but the rhythm still privileged Tools at
 * the top. The user's read: the books and editorial collections are
 * the *destination* people came for; the utility surfaces (Tools /
 * Useful / App) are launcher targets, not the lead.
 *
 * v7 inverts:
 *   1. DISCOVER moves to the top. Two landscape book covers + a
 *      pair of editorial-list icon tiles (History / Collections).
 *      This is the surface that earns a return visit.
 *   2. TOOLS, USEFUL, APP all collapse to the same icon-tile grid
 *      — small label under a tinted-circle icon, no description.
 *      One language for every launcher. The descriptions still
 *      live in aria-label so screen-readers and search get them;
 *      we just don't paint a paragraph next to every glyph.
 *
 * This puts the heaviest visual weight on the surface with the most
 * editorial richness and turns the utility clusters into a
 * scannable home-screen-style grid.
 */

type Item = {
  href: string;
  label: string;
  description: string;
  icon: typeof Wrench;
  /** Accent color for the icon background — one per item so the
   *  sheet reads as a colored list instead of a wall of blue. */
  color: string;
  external?: boolean;
};

// TOOLS section retired May 2026 (Field Guide Phase 2):
//   - Plan now lives as a "Plan tonight" CTA at the top of /events
//   - Within reach IS the default /map experience (Radius mode)
//   - Pulse lives as an active-alert indicator in the header
// All three action verbs have better, more-contextual homes than a
// hidden drawer; the drawer no longer needs a Tools section.

// The old flat "Useful" wall (9 undifferentiated tiles) read as a
// low-scent grid — you had to read every label to find anything. Split
// into three labeled, scannable clusters (Getting around / Outdoors /
// Around the county) so the eye can jump to the right neighborhood
// first. Nothing removed — every tile is still a live, indexable route.
// Local intel — the verified-curated layer that's the app's real moat
// (happy hours today, and Deals once /deals ships). Leads the sheet on
// purpose: this is the reason to open the app, not a utility afterthought.
const LOCAL_INTEL: Item[] = [
  { href: "/happy-hour", label: "Happy hour", description: "Verified happy hours across the county, by day", icon: Wine, color: "var(--app-brand)" },
  { href: "/brunch", label: "Brunch", description: "Every spot with a real weekend brunch, confirmed at the source", icon: Croissant, color: "var(--app-brand)" },
  { href: "/deals", label: "Intel", description: "Verified daily specials across the county, by day", icon: Tag, color: "var(--app-brand)" },
];

const GETTING_AROUND: Item[] = [
  { href: "/parking",   label: "Parking",   description: "Downtown garages, rates, and event-day closures",     icon: SquareParking, color: "var(--app-ink-2)" },
  { href: "/transit",   label: "Transit",   description: "TransIT bus routes and stops",                      icon: Bus,           color: "var(--app-cool)" },
  { href: "/amenities", label: "Amenities", description: "Restrooms, water, wifi, EV charging, bike parking", icon: Wrench,        color: "var(--app-brand)" },
];

const OUTDOORS: Item[] = [
  { href: "/trails",    label: "Trails",    description: "200+ miles of hikes, towpaths, and rail-trails",    icon: Mountain,      color: "var(--app-positive)" },
  { href: "/parks",     label: "Parks",     description: "Public parks across all 12 municipalities",          icon: TreeDeciduous, color: "var(--app-brand-2)" },
  // "Water" tile collapsed into Rivers (May 2026 IA cleanup). The
  // /water page redirected to /rivers because both rendered the same
  // USGS gauge data; the intended "drinking fountains" surface lives
  // under the Pools/Amenities map filter when curated data lands.
  { href: "/rivers",    label: "Rivers & creeks", description: "Live USGS gauges · gage height + flow + 24-hour trend", icon: Waves, color: "var(--app-cool)" },
];

const AROUND_COUNTY: Item[] = [
  { href: "/pulse",     label: "County pulse", description: "Right now: traffic, power outages, school closings, 311", icon: Activity, color: "var(--app-brand)" },
  { href: "/overhead",  label: "Overhead", description: "Live radar of planes flying over the county right now", icon: Plane, color: "var(--app-cool)" },
  { href: "/markers",   label: "Markers & landmarks", description: "Every roadside marker's inscription + the National Register sites", icon: Landmark, color: "#7A5C2E" },
  { href: "/plan",      label: "Plan a day", description: "Build a shareable Frederick day itinerary",           icon: Route,         color: "var(--app-brand-2)" },
  { href: "/contacts",  label: "Contacts",  description: "City and county department directory",              icon: Building2,     color: "var(--app-ink-2)" },
];

const APP: Item[] = [
  { href: "/about",    label: "About",        description: "What this app is and how it stays honest",     icon: Info,        color: "var(--app-ink-2)" },
  { href: "/trust",    label: "Trust & data", description: "Where the data comes from and what the badges mean", icon: ShieldCheck, color: "var(--app-cool)" },
  { href: "/settings", label: "Settings",     description: "Persona, home spot, interests, notifications", icon: SettingsIcon, color: "var(--app-ink-3)" },
];

export default function MoreSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const close = () => onOpenChange(false);

  return (
    <BottomDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="More"
      subtitle="Useful pages and settings"
    >
      <div className="space-y-5 px-4 pt-3 pb-6">
        {/* DISCOVER + TOOLS sections retired (Field Guide Phase 2,
            May 2026). Discover items (books, History, Collections)
            moved to /about as Companion content. Tools (Plan,
            Within reach, Pulse) moved to their natural homes —
            /events CTA, /map default mode, header indicator
            respectively. The drawer now leads with the secondary
            destinations, split into three scannable clusters — Getting
            around / Outdoors / Around the county — instead of one flat
            "Useful" wall you had to read end-to-end. APP closes out the
            sheet so About, Trust, Settings stay reachable. */}

        <IconCluster heading="Local intel" items={LOCAL_INTEL} onClose={close} columns={3} />
        <IconCluster heading="Getting around" items={GETTING_AROUND} onClose={close} columns={3} />
        <IconCluster heading="Outdoors" items={OUTDOORS} onClose={close} columns={3} />
        <IconCluster heading="Around the county" items={AROUND_COUNTY} onClose={close} columns={3} />
        <IconCluster heading="App" items={APP} onClose={close} columns={3} />
      </div>
    </BottomDrawer>
  );
}

/**
 * Icon-tile cluster used by Tools / Useful / App and (for symmetry)
 * Discover's editorial rows. App-drawer pattern: tinted circle icon
 * + small label beneath, no description. Descriptions still flow
 * through aria-label so screen-readers and search keep the context.
 *
 * `columns` controls the grid density: 3 for verbs/launcher rows,
 * 4 for the long USEFUL list so it doesn't sprawl.
 */
function IconCluster({
  heading,
  items,
  onClose,
  columns,
}: {
  heading: string;
  items: Item[];
  onClose: () => void;
  columns: 3 | 4;
}) {
  const gridClass = columns === 4 ? "grid-cols-4" : "grid-cols-3";
  return (
    <section className="space-y-2">
      <h3 className="eyebrow px-1" style={{ color: "var(--app-ink-3)" }}>
        {heading}
      </h3>
      <ul className={`grid gap-1.5 ${gridClass}`}>
        {items.map((it) => (
          <li key={it.href}>
            <IconTile {...it} onClose={onClose} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Single icon tile — tinted circle icon, label below, no
 *  description text. Shared by Discover editorial rows + the
 *  three icon clusters so the visual language is consistent. */
function IconTile({
  href,
  label,
  description,
  icon: Icon,
  color,
  external,
  onClose,
}: Item & { onClose: () => void }) {
  const body = (
    <>
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}
      >
        <Icon
          className="h-[18px] w-[18px]"
          strokeWidth={2}
          style={{ color }}
        />
      </span>
      <span
        className="block text-center text-[12px] font-semibold leading-tight"
        style={{ color: "var(--app-ink)" }}
      >
        {label}
      </span>
    </>
  );
  const className =
    "hover-lift flex h-[92px] w-full flex-col items-center justify-center gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-2 transition";
  const style = {
    borderColor: "var(--app-border)",
    boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
  };
  const aria = `${label}: ${description}`;
  return external ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClose}
      className={className}
      style={style}
      aria-label={aria}
    >
      {body}
    </a>
  ) : (
    <Link
      href={href}
      onClick={onClose}
      className={className}
      style={style}
      aria-label={aria}
    >
      {body}
    </Link>
  );
}

