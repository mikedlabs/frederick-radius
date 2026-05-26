import Link from "next/link";
import { Coffee, Utensils, Wine, Trees, Baby, Palette, Landmark, X } from "lucide-react";
import { INTENTS, type Intent } from "@/data/intents";

const ICON: Record<Intent["icon"], typeof Coffee> = {
  Coffee,
  Utensils,
  Wine,
  Trees,
  Baby,
  Palette,
  Landmark,
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
}: {
  active?: string;
  /** Number of places matching the active intent — shown in the
   *  prominent active banner so the filter feels REAL. */
  activeCount?: number;
}) {
  const activeIntent = active ? INTENTS.find((i) => i.key === active) : null;
  const ActiveIcon = activeIntent ? ICON[activeIntent.icon] : null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 space-y-2 px-2.5 sm:px-3"
      style={{ paddingTop: "calc(2.5rem + env(safe-area-inset-top, 0px) + 18px)" }}
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
          </span>
          {typeof activeCount === "number" && (
            <span className="shrink-0 rounded-full bg-white/22 px-2 py-0.5 text-[11px] font-bold tabular-nums backdrop-blur">
              {activeCount.toLocaleString()}
            </span>
          )}
          <Link
            href="/browse"
            aria-label="Clear filter"
            className="-mr-1.5 inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/22 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] backdrop-blur transition active:scale-[0.96]"
          >
            <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            Clear
          </Link>
        </div>
      )}
      <div
        className="pointer-events-auto mx-auto flex w-full max-w-[680px] gap-2 overflow-x-auto rounded-full p-1.5 backdrop-blur [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          background: "color-mix(in srgb, var(--app-bg-elevated) 88%, transparent)",
          boxShadow: "var(--app-shadow-2)",
        }}
      >
        <Link
          href="/browse"
          aria-current={!active ? "page" : undefined}
          className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition active:scale-[0.97]"
          style={{
            background: !active ? "var(--app-ink)" : "transparent",
            color: !active ? "var(--app-bg)" : "var(--app-ink-2)",
          }}
        >
          All
        </Link>
        {INTENTS.map((intent) => {
          const Icon = ICON[intent.icon];
          const isActive = active === intent.key;
          return (
            <Link
              key={intent.key}
              href={`/map?intent=${intent.key}`}
              aria-current={isActive ? "page" : undefined}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-tight transition active:scale-[0.97]"
              style={{
                background: isActive
                  ? intent.color
                  : `color-mix(in srgb, ${intent.color} 14%, transparent)`,
                color: isActive ? "#fff" : intent.color,
              }}
            >
              <Icon className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              {intent.label.split(" ")[0]}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
