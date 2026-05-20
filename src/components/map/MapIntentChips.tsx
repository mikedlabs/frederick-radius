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
export default function MapIntentChips({ active }: { active?: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 px-2.5 sm:px-3"
      style={{ paddingTop: "calc(2.5rem + env(safe-area-inset-top, 0px) + 18px)" }}
      aria-label="Filter map by intent"
    >
      <div
        className="pointer-events-auto mx-auto flex w-full max-w-[680px] gap-2 overflow-x-auto rounded-full p-1.5 backdrop-blur [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          background: "color-mix(in srgb, var(--app-bg-elevated) 88%, transparent)",
          boxShadow: "var(--app-shadow-2)",
        }}
      >
        <Link
          href="/map"
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
        {active && (
          <Link
            href="/map"
            aria-label="Clear filter"
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-tight"
            style={{
              background: "color-mix(in srgb, var(--app-ink) 6%, transparent)",
              color: "var(--app-ink-2)",
            }}
          >
            <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            Clear
          </Link>
        )}
      </div>
    </div>
  );
}
