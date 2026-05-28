"use client";

import Link from "next/link";
import Image from "next/image";
import {
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
  Landmark,
  Droplets,
  ExternalLink,
  ArrowUpRight,
  Sparkles,
  ShieldCheck,
  Waves,
  TreeDeciduous,
} from "lucide-react";
import BottomDrawer from "@/components/ui/BottomDrawer";

/**
 * MoreSheet v5 — Field Guide cleanup pass (May 2026).
 *
 * v4 worked but had three problems the brand review surfaced:
 *   1. Title said "More" while the nav label said "Field guide"
 *      — a one-step inconsistency that made the product feel
 *      unfinished on the first interaction.
 *   2. The TOOLS row used aspect-square tiles that ate ~40% of
 *      visible drawer height for three items. Visual weight didn't
 *      match the actual information they carried.
 *   3. The USEFUL section was seven identical-shaped rows in a
 *      single column — a wall of repetition.
 *
 * v5 fixes:
 *   - Drawer title is now "Field guide" (matches the nav label).
 *     Subtitle is short, declarative, no cute filler.
 *   - TOOLS are short horizontal tiles (~80px tall) instead of
 *     aspect-square. Same color identity, ~½ the vertical real
 *     estate, more breathing room for the rest.
 *   - USEFUL is a 2-column grid, so seven items become four rows
 *     instead of seven. Per-item color identity is kept.
 *   - Parks gets a distinct icon (TreeDeciduous) so it doesn't
 *     collide visually with Trails (Mountain).
 *
 * Same TABS schema, same per-item color identity. The cleanup is
 * spatial + verbal, not structural.
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

/** Tools — the action verbs. Surface them as full-color tiles
 *  (3-up) so they read above the noun rows below. */
const TOOLS: Item[] = [
  { href: "/plan",   label: "Plan",        description: "Dinner, drinks, late",       icon: CalendarRange, color: "var(--app-brand)" },
  { href: "/radius", label: "Within reach", description: "Walkable · bikable · car",  icon: MapPinned,     color: "var(--app-cool)" },
  { href: "/pulse",  label: "Pulse",       description: "Live county status",         icon: Activity,      color: "var(--app-accent)" },
];

const USEFUL: Item[] = [
  { href: "/amenities", label: "Amenities", description: "Restrooms, water, wifi, EV charging, bike parking", icon: Wrench,        color: "var(--app-brand)" },
  { href: "/contacts",  label: "Contacts",  description: "City and county department directory",              icon: Building2,     color: "var(--app-ink-2)" },
  { href: "/transit",   label: "Transit",   description: "TransIT bus routes and stops",                      icon: Bus,           color: "var(--app-cool)" },
  { href: "/trails",    label: "Trails",    description: "200+ miles of hikes, towpaths, and rail-trails",    icon: Mountain,      color: "var(--app-positive)" },
  { href: "/parks",     label: "Parks",     description: "Public parks across all 12 municipalities",          icon: TreeDeciduous, color: "var(--app-brand-2)" },
  { href: "/rivers",    label: "Rivers",    description: "Live creek and river gauges with 24-hour trend",     icon: Waves,         color: "var(--app-cool)" },
  { href: "/water",     label: "Water",     description: "Public drinking fountains and water bottle refills", icon: Droplets,      color: "var(--app-info)" },
];

const BOOKS: Array<{
  href: string;
  label: string;
  description: string;
  cover: string;
  external?: boolean;
}> = [
  {
    href: "/from-above/preview",
    label: "From Above",
    description: "Drone photography over Frederick",
    cover: "/from-above/cover-front.webp",
  },
  {
    href: "https://www.colorfrederick.com",
    label: "Color Frederick",
    description: "The Frederick coloring book",
    cover: "/images/color-frederick-cover.webp",
    external: true,
  },
];

const DISCOVER_ROWS: Item[] = [
  { href: "/history",     label: "History",     description: "Frederick County, one story at a time",                icon: Landmark, color: "var(--app-brand-2)" },
  { href: "/collections", label: "Collections", description: "Editorial lists — date nights, rainy days, kid energy", icon: Sparkles, color: "var(--app-accent)" },
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
      title="Field guide"
      subtitle="Tools, layers, books, and the rest"
    >
      <div className="space-y-5 px-4 pt-3 pb-6">
        {/* TOOLS — action verbs as a 3-up centered tile grid. v6
            puts visual weight back where it belongs: bigger icon
            circle (44px), no description (action verbs read fine
            without one), centered layout. These are the lead
            actions, so they SHOULD be the heaviest items on the
            sheet — earlier v5 made them visually weaker than
            Useful rows, which inverted the hierarchy. */}
        <section className="space-y-2">
          <h3 className="eyebrow px-1" style={{ color: "var(--app-ink-3)" }}>
            Tools
          </h3>
          <ul className="grid grid-cols-3 gap-1.5">
            {TOOLS.map((it) => {
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={close}
                    aria-label={`${it.label} — ${it.description}`}
                    className="hover-lift flex h-24 w-full flex-col items-center justify-center gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 text-center transition"
                    style={{
                      borderColor: "var(--app-border)",
                      boxShadow:
                        "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                    }}
                  >
                    <span
                      aria-hidden
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                      style={{
                        background: `color-mix(in srgb, ${it.color} 14%, transparent)`,
                      }}
                    >
                      <Icon
                        className="h-[20px] w-[20px]"
                        strokeWidth={2}
                        style={{ color: it.color }}
                      />
                    </span>
                    <span
                      className="block text-[13px] font-semibold leading-none"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {it.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <Cluster heading="Useful" items={USEFUL} onClose={close} columns={2} />

        {/* Discover — book cards then editorial rows. */}
        <section className="space-y-2">
          <h3 className="eyebrow px-1" style={{ color: "var(--app-ink-3)" }}>
            Discover
          </h3>
          <ul className="grid grid-cols-2 gap-2">
            {BOOKS.map((b) => (
              <li key={b.href}>
                <BookCard {...b} onClose={close} />
              </li>
            ))}
          </ul>
          <ul className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-2">
            {DISCOVER_ROWS.map((it) => (
              <li key={it.href}>
                <DirectoryRow {...it} onClose={close} />
              </li>
            ))}
          </ul>
        </section>

        <Cluster heading="App" items={APP} onClose={close} />
      </div>
    </BottomDrawer>
  );
}

function Cluster({
  heading,
  items,
  onClose,
  columns = 1,
}: {
  heading: string;
  items: Item[];
  onClose: () => void;
  /** 1 = full-width rows (small clusters); 2 = side-by-side grid
   *  (used for the big USEFUL cluster so seven items don't read as
   *  a wall of seven identical rows). */
  columns?: 1 | 2;
}) {
  const ulClass =
    columns === 2
      ? "grid grid-cols-1 gap-1.5 sm:grid-cols-2"
      : "space-y-1.5";
  return (
    <section className="space-y-1.5">
      <h3 className="eyebrow px-1" style={{ color: "var(--app-ink-3)" }}>
        {heading}
      </h3>
      <ul className={ulClass}>
        {items.map((it) => (
          <li key={it.href}>
            <DirectoryRow {...it} onClose={onClose} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DirectoryRow({
  href,
  label,
  description,
  icon: Icon,
  color,
  external,
  onClose,
}: Item & { onClose: () => void }) {
  // Per-item color identity — was a sea of identical cool-tinted
  // icons. Now each row carries its own accent so the eye can sort
  // by type without reading every label.
  const body = (
    <>
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}
      >
        <Icon
          className="h-[18px] w-[18px]"
          strokeWidth={2}
          style={{ color }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block text-[13px] font-semibold"
          style={{ color: "var(--app-ink)" }}
        >
          {label}
        </span>
        <span
          className="block truncate text-[11px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {description}
        </span>
      </span>
      {external && (
        <ExternalLink
          aria-hidden
          className="h-3.5 w-3.5 shrink-0"
          strokeWidth={2}
          style={{ color: "var(--app-ink-3)" }}
        />
      )}
    </>
  );
  const className =
    "hover-lift flex items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 transition";
  const style = {
    borderColor: "var(--app-border)",
    boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
  };
  return external ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClose}
      className={className}
      style={style}
    >
      {body}
    </a>
  ) : (
    <Link href={href} onClick={onClose} className={className} style={style}>
      {body}
    </Link>
  );
}

/** Visual book card — unchanged from v3 (full-bleed cover, "Book"
 *  pill top-left, external arrow when applicable). */
function BookCard({
  href,
  label,
  description,
  cover,
  external,
  onClose,
}: {
  href: string;
  label: string;
  description: string;
  cover: string;
  external?: boolean;
  onClose: () => void;
}) {
  const body = (
    <>
      <Image
        src={cover}
        alt=""
        fill
        sizes="(max-width: 480px) 50vw, 240px"
        className="object-cover"
      />
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.28) 55%, transparent 90%)",
        }}
      />
      {external && (
        <span
          aria-hidden
          className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full"
          style={{
            background: "rgba(255,255,255,0.88)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxShadow: "var(--app-shadow-1)",
          }}
        >
          <ArrowUpRight
            className="h-3.5 w-3.5"
            strokeWidth={2.25}
            style={{ color: "var(--app-ink)" }}
          />
        </span>
      )}
      <span
        aria-hidden
        className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]"
        style={{
          background: "rgba(255,255,255,0.88)",
          color: "var(--app-ink)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        <BookOpen className="h-3 w-3" strokeWidth={2.25} />
        Book
      </span>
      <span className="absolute inset-x-0 bottom-0 p-3">
        <span
          className="block font-serif text-[15px] font-semibold leading-tight text-white"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}
        >
          {label}
        </span>
        <span
          className="mt-0.5 block text-[10.5px] leading-snug text-white/85"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.55)" }}
        >
          {description}
        </span>
      </span>
    </>
  );
  // v6: book covers are decorative, not the point of the sheet.
  // aspect-[16/9] reads as a wide thumbnail strip — same cover,
  // same gradient, same "Book" pill, but ~⅔ less vertical weight
  // than the v5 4/3 card. The field guide's primary job is
  // Tools + Useful; the books should support, not dominate.
  const className =
    "tactile tactile-interactive relative block aspect-[16/9] w-full overflow-hidden rounded-[var(--app-radius-md)] border transition active:scale-[0.98]";
  const style = {
    borderColor: "var(--app-border)",
    boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
  };
  return external ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClose}
      className={className}
      style={style}
      aria-label={label}
    >
      {body}
    </a>
  ) : (
    <Link
      href={href}
      onClick={onClose}
      className={className}
      style={style}
      aria-label={label}
    >
      {body}
    </Link>
  );
}
