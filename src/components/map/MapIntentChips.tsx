import Link from "next/link";
import {
  Coffee,
  Utensils,
  Wine,
  Beer,
  Trees,
  Baby,
  Palette,
  Landmark,
  Pizza,
  Cookie,
  Truck,
  Mountain,
  Music,
  Library,
  Building,
  ShieldCheck,
  Vote,
  Church,
  Theater,
  Image as ImageIcon,
  ToyBrick,
  Heart,
  Activity,
  Dumbbell,
  Sparkles,
  ShoppingBag,
  Hotel,
  Pill,
  Flower2,
  Waves,
  Shirt,
  Recycle,
  Home,
  Gift,
  Gem,
  ShoppingCart,
  Store,
  BookOpen,
  FerrisWheel,
  Flag,
  Users,
  X,
} from "lucide-react";
import { INTENTS, type SubIntent } from "@/data/intents";

const ICON: Record<NonNullable<SubIntent["icon"]>, typeof Coffee> = {
  Coffee,
  Utensils,
  Wine,
  Beer,
  Trees,
  Baby,
  Palette,
  Landmark,
  Pizza,
  Cookie,
  Truck,
  Mountain,
  Music,
  Library,
  Building,
  ShieldCheck,
  Vote,
  Church,
  Theater,
  ImageIcon,
  ToyBrick,
  Heart,
  Activity,
  Dumbbell,
  Sparkles,
  ShoppingBag,
  Hotel,
  Pill,
  Flower2,
  Waves,
  Shirt,
  Recycle,
  Home,
  Gift,
  Gem,
  ShoppingCart,
  Store,
  BookOpen,
  FerrisWheel,
  Flag,
  Users,
};

/**
 * MapIntentChips — colored horizontal pill row pinned to the top of
 * the map. Each chip is a Link that swaps the ?intent= search param,
 * triggering a server re-render with the filtered place set. A "Clear"
 * chip appears on the right when a filter is active.
 *
 * The chips are designed to be the FIRST thing a visitor reaches for
 * after the map paints. They double as visual anchors — six colors,
 * six icons, instantly readable as "what kind of places live here".
 */
export default function MapIntentChips({
  active,
  activeCount,
  activeSub,
  subCounts,
  openNow,
  children,
}: {
  active?: string;
  /** Number of places matching the active intent — shown in the
   *  prominent active banner so the filter feels REAL. */
  activeCount?: number;
  /** Currently-active sub-intent key, when the user has drilled in
   *  one level deeper (Eat & drink → Pizza). */
  activeSub?: string;
  /** Per-sub-intent place counts so the sub-chips can show "Pizza · 12"
   *  and the user doesn't tap into an empty filter. */
  subCounts?: Record<string, number>;
  /** Whether the ?open=now place filter is active. Preserved across
   *  intent / sub-intent chip taps so the temporal lens doesn't
   *  reset when the user switches categories. */
  openNow?: boolean;
  /** Slot at the BOTTOM of the chips stack — used by /browse to render
   *  the MapTimeChips strip directly below the intent chips. Used to be
   *  two siblings with independent `top: calc(...)` positions, which
   *  caused the time chips to overlap the intent chips strip when the
   *  active-intent banner pushed everything down by one row. Putting
   *  them in the same space-y-2 flow makes the layout naturally stack
   *  regardless of how many rows the intent group has. */
  children?: React.ReactNode;
}) {
  const activeIntent = active ? INTENTS.find((i) => i.key === active) : null;
  const ActiveIcon = activeIntent ? ICON[activeIntent.icon] : null;
  const activeSubIntent =
    activeIntent && activeSub
      ? activeIntent.subIntents?.find((s) => s.key === activeSub)
      : null;
  // Suffix attached to every intent/sub chip href so a tap keeps the
  // Open-now lens active. Empty string when openNow is off so we don't
  // pollute URLs with stray params.
  const openSuffix = openNow ? "&open=now" : "";
  // Preserve browse mode when clearing with an active open-now filter —
  // otherwise /map defaults to radius mode where open-now doesn't exist,
  // silently dropping the filter (and the chips). (UX review fix.)
  const clearHref = openNow ? "/map?mode=browse&open=now" : "/map";
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-[var(--z-sticky)] space-y-2 px-2.5 sm:px-3"
      // Pre-2026-05-28 this had paddingTop "calc(2.5rem + safe-area
      // + 18px)" to clear the floating MapModes shelf + toggle that
      // used to sit above it. Both have since moved into inline
      // strips above and below the map (the map page's flow now
      // handles the layout), so the chips can sit closer to the
      // map's top edge. 8px of top-of-map breathing room is enough;
      // TopBar's own safe-area-top is already absorbed in the page
      // layout above this container.
      style={{ paddingTop: "8px" }}
      aria-label="Filter map by intent"
    >
      {/* Active-intent banner — only present when a filter is on. A
          bold colored bar with the intent label, count, and a clear
          chip on the right. This is the "the map looks different now"
          signal that the filter is doing something real. */}
      {activeIntent && ActiveIcon && (
        <div
          className="pointer-events-auto mx-auto flex w-full max-w-[680px] items-center gap-2.5 rounded-full px-3.5 py-2"
          style={{
            background: activeIntent.color,
            color: "#fff",
            boxShadow: `0 10px 30px -10px ${activeIntent.color}`,
          }}
        >
          <ActiveIcon className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight">
            {activeIntent.label}
            {activeSubIntent && (
              <span className="opacity-80"> · {activeSubIntent.label}</span>
            )}
          </span>
          {typeof activeCount === "number" && (
            <span className="shrink-0 rounded-full bg-white/22 px-2 py-0.5 text-[11px] font-bold tabular-nums backdrop-blur">
              {activeCount.toLocaleString()}
            </span>
          )}
          <Link
            href={clearHref}
            aria-label="Clear filter"
            className="-mr-1.5 inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/22 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] backdrop-blur transition active:scale-[0.96]"
            prefetch={false}
          >
            <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            Clear
          </Link>
        </div>
      )}
      {/* Sub-intent strip — appears below the active-intent banner
          when the user has drilled into an intent that defines
          sub-categories. Each chip narrows the parent filter one
          more level: Eat & drink → Pizza shows only pizza places.
          Empty when the active intent has no subIntents (Wineries
          is already narrow enough; civic doesn't sub-divide here).
          The chips inherit the parent intent's color family so the
          two strips read as one connected filter, not separate
          surfaces. */}
      {activeIntent?.subIntents && activeIntent.subIntents.length > 0 && (
        <div
          className="pointer-events-auto mx-auto flex w-full max-w-[680px] gap-1.5 overflow-x-auto rounded-full p-1 backdrop-blur [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            background: `color-mix(in srgb, ${activeIntent.color} 10%, var(--app-bg-elevated) 88%)`,
            boxShadow: "var(--app-shadow-1)",
          }}
          aria-label={`Narrow ${activeIntent.label}`}
        >
          {/* "All" sub-chip — clears the sub filter while keeping the
              parent intent active. Same shape as the parent's "All"
              chip but smaller. */}
          <Link
            href={`/map?intent=${activeIntent.key}${openSuffix}`}
            aria-current={!activeSub ? "page" : undefined}
            className="tap-44 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] transition active:scale-[0.97]"
            style={{
              background: !activeSub ? activeIntent.color : "transparent",
              color: !activeSub ? "#fff" : activeIntent.color,
            }}
          >
            All
            {typeof activeCount === "number" && (
              <span className="ml-1 tabular-nums opacity-80">
                {activeCount.toLocaleString()}
              </span>
            )}
          </Link>
          {activeIntent.subIntents.map((sub) => {
            const SubIcon = sub.icon ? ICON[sub.icon] : null;
            const isActive = activeSub === sub.key;
            const count = subCounts?.[sub.key];
            return (
              <Link
                key={sub.key}
                href={`/map?intent=${activeIntent.key}&sub=${sub.key}${openSuffix}`}
                aria-current={isActive ? "page" : undefined}
                className="tap-44 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight transition active:scale-[0.97]"
                style={{
                  background: isActive
                    ? activeIntent.color
                    : "transparent",
                  color: isActive ? "#fff" : activeIntent.color,
                }}
              >
                {SubIcon && <SubIcon className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
                {sub.label}
                {typeof count === "number" && count > 0 && (
                  <span className="tabular-nums opacity-75">{count}</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
      {/* The always-on intent "quick picks" row (Coffee · Eat & drink ·
          Wineries · …) was removed: it pre-decided what the user was looking
          for the moment they opened the map. The map is now search-first — the
          header search finds anything in seconds, and the full category list
          still lives in the Layers panel for browse-by-kind. The active-intent
          banner + sub-intent strip above stay, so arriving via a deep link
          (?intent=coffee, e.g. a Today craving) still shows what's filtered and
          how to clear it. */}
      {/* Bottom slot — typically the MapTimeChips strip. Lives inside
          the same absolute container so the layout naturally stacks
          regardless of which intent rows above it are visible (banner,
          sub-intents, main chips). The outer `space-y-2` gives an 8px
          gap between rows. */}
      {children}
    </div>
  );
}
