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
} from "lucide-react";
import BottomDrawer from "@/components/ui/BottomDrawer";

/**
 * MoreSheet v3 — tools first, books shown like books.
 *
 * v2 stacked a plan-hero, a 3-card right-now grid, and a time-aware
 * banner on top of the directory. The user's read: the sheet should
 * "start with the tools and remove the other things above that" —
 * the action surface in /now already covers Plan / Open-now /
 * Tonight; the More menu shouldn't reproduce them.
 *
 * Order:
 *   1. TOOLS — Plan, Within reach, Pulse. The verbs.
 *   2. USEFUL — Amenities / Transit / Trails / Parks / Water /
 *      Contacts. The nouns the city carries.
 *   3. DISCOVER — the editorial surface. The two physical books
 *      (From Above + Color Frederick) get real photo cards using
 *      their cover art so a tap reads as opening a book, not a
 *      menu row. History stays as a row.
 *   4. APP — About + Settings. The chrome.
 */

type Item = {
  href: string;
  label: string;
  description: string;
  icon: typeof Wrench;
  external?: boolean;
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
  { href: "/parks",     label: "Parks",     description: "Public parks across all 12 municipalities",          icon: Mountain },
  { href: "/water",     label: "Water",     description: "Public drinking fountains and water bottle refills", icon: Droplets },
];

/** Editorial surfaces. The two books get visual cards above the
 *  History row — they ARE objects, so they should look like objects,
 *  not menu entries. */
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
    // No local cover for the coloring book (it lives on
    // colorfrederick.com). Using the most color-rich seasonal photo
    // we have so the card still sells the idea — a colorful
    // Frederick scene next to the title makes the link feel like a
    // book preview, not a directory entry.
    cover: "/images/seasons/fall/FALL COLORS.jpg",
    external: true,
  },
];

const HISTORY: Item = {
  href: "/history",
  label: "History",
  description: "Frederick County, one story at a time",
  icon: Landmark,
};

const APP: Item[] = [
  { href: "/about",    label: "About",    description: "What this app is and how it stays honest",     icon: Info },
  { href: "/settings", label: "Settings", description: "Persona, home spot, interests, notifications", icon: SettingsIcon },
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
      subtitle="Tools, the city's bits, and the books"
    >
      <div className="space-y-5 px-4 pt-3 pb-6">
        <Cluster heading="Tools" items={TOOLS} onClose={close} />
        <Cluster heading="Useful" items={USEFUL} onClose={close} />

        {/* Discover — books shown as books, then history as a row. */}
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
          <ul className="space-y-1.5 pt-1">
            <li>
              <DirectoryRow {...HISTORY} onClose={close} />
            </li>
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
}: {
  heading: string;
  items: Item[];
  onClose: () => void;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="eyebrow px-1" style={{ color: "var(--app-ink-3)" }}>
        {heading}
      </h3>
      <ul className="space-y-1.5">
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
  external,
  onClose,
}: Item & { onClose: () => void }) {
  const body = (
    <>
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
        style={{ background: "color-mix(in srgb, var(--app-cool) 14%, transparent)" }}
      >
        <Icon
          className="h-[18px] w-[18px]"
          strokeWidth={2}
          style={{ color: "var(--app-cool)" }}
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

/** Visual book card — full-bleed cover photo with the title and a
 *  one-line gloss reading from a dark gradient at the bottom. The
 *  external arrow appears in the top-right when the destination
 *  leaves the app. */
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
  const className =
    "tactile tactile-interactive relative block aspect-[3/4] w-full overflow-hidden rounded-[var(--app-radius-md)] border transition active:scale-[0.98]";
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
