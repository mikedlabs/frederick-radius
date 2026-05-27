"use client";

import Link from "next/link";
import {
  Compass,
  Info,
  MapPinned,
  Wrench,
  Building2,
  Bus,
  Mountain,
  BookOpen,
  Settings as SettingsIcon,
  Activity,
  CalendarRange,
} from "lucide-react";
import BottomDrawer from "@/components/ui/BottomDrawer";

/**
 * MoreSheet — the "More" tab's drawer, hosting every route that
 * orbits the four primary tabs (Now, Browse, Events, Saved) but
 * doesn't deserve top-level real estate.
 *
 * Pre-launch every one of these routes was an orphan: reachable only
 * via deep link or a scattered button somewhere in /now. Users had no
 * way to discover them. This drawer is the answer — one organized
 * sheet, opened from the BottomNav's 5th tab, that lists every
 * secondary surface with a one-line description so a stranger knows
 * what each one is for.
 *
 * Organized into clusters so the list reads as "what would you do?"
 * not "what slugs exist?". Tools at top (active, do-something
 * routes), then Useful (county utilities), then Discover (slower,
 * stay-a-while routes), then App (settings + identity).
 *
 * Drawer state lives in BottomNav so the 5th tab can drive it. This
 * component is pure presentation; it receives open/onOpenChange and
 * renders the menu inside the shared Vaul wrapper.
 */

type Item = {
  href: string;
  label: string;
  description: string;
  icon: typeof Compass;
};

const TOOLS: Item[] = [
  { href: "/plan",   label: "Plan a night",  description: "Dinner, drinks, somewhere to land late",         icon: CalendarRange },
  { href: "/radius", label: "Within reach",  description: "What's reachable on foot, by bike, or by car",   icon: MapPinned },
  { href: "/pulse",  label: "Pulse",          description: "What's open, busy, or moving across the county", icon: Activity },
];

const USEFUL: Item[] = [
  { href: "/amenities", label: "Amenities", description: "Restrooms, water, wifi, EV charging, bike parking", icon: Wrench },
  { href: "/contacts",  label: "Contacts",  description: "City and county department directory",              icon: Building2 },
  { href: "/transit",   label: "Transit",   description: "TransIT bus routes and stops",                      icon: Bus },
  { href: "/trails",    label: "Trails",    description: "200+ miles of hikes, towpaths, and rail-trails",    icon: Mountain },
];

const DISCOVER: Item[] = [
  { href: "/from-above/preview", label: "From Above", description: "The coffee-table book of drone photography over Frederick", icon: BookOpen },
];

const APP: Item[] = [
  { href: "/about",    label: "About",    description: "What this app is and how it stays honest", icon: Info },
  { href: "/settings", label: "Settings", description: "Persona, home spot, interests, notifications", icon: SettingsIcon },
];

export default function MoreSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <BottomDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="More"
      subtitle="Everything else this app does"
    >
      <div className="space-y-5 px-4 pt-3 pb-6">
        <Cluster heading="Tools" items={TOOLS} onClose={() => onOpenChange(false)} />
        <Cluster heading="Useful" items={USEFUL} onClose={() => onOpenChange(false)} />
        <Cluster heading="Discover" items={DISCOVER} onClose={() => onOpenChange(false)} />
        <Cluster heading="App" items={APP} onClose={() => onOpenChange(false)} />
      </div>
    </BottomDrawer>
  );
}

function Cluster({
  heading,
  items,
  onClose,
}: {
  heading: string;
  items: Item[];
  onClose: () => void;
}) {
  return (
    <section className="space-y-1.5">
      <h3
        className="eyebrow px-1"
        style={{ color: "var(--app-ink-3)" }}
      >
        {heading}
      </h3>
      <ul className="space-y-1.5">
        {items.map(({ href, label, description, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              onClick={onClose}
              className="hover-lift flex items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 transition"
              style={{
                borderColor: "var(--app-border)",
                boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
              }}
            >
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                style={{ background: "color-mix(in srgb, var(--app-cool) 14%, transparent)" }}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: "var(--app-cool)" }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                  {label}
                </span>
                <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                  {description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
