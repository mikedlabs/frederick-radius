import Link from "next/link";
import {
  Clock4,
  CloudRain,
  Wrench,
  Footprints,
  Eye,
} from "lucide-react";

/**
 * MapModes — preset "decision surface" chips that sit above the map.
 *
 * Per the May 2026 brand review:
 *   Most maps show everything. Frederick Radius should show the right
 *   layer for the moment.
 *
 * Each mode is a CURATED DEEP LINK — clicking it sets the URL params
 * that produce the right view, nothing more. No new state machine,
 * no complex toggle plumbing; the URL is the source of truth. Active
 * state lights up when the user's current params match the preset.
 *
 * The five modes:
 *   - Open now    →  browse + ?open=now (anything open right now)
 *   - Walking     →  /map?mode=radius (downtown pin + 10-min walk)
 *   - Practical   →  browse + ?intent=civic (restrooms, parking, ...)
 *   - Rain plan   →  browse + ?intent=arts (indoor museums/cafes)
 *   - Browse all  →  browse, no filters (the classic everything view)
 *
 * Hidden on radius mode because radius mode IS its own "decision
 * surface" — pinning to a center + a distance is the question. We
 * don't double the answer.
 */
type ModeKey = "open" | "walking" | "practical" | "rain" | "browse";

type Mode = {
  key: ModeKey;
  label: string;
  icon: typeof Clock4;
  /** Destination URL with the params that produce this view. */
  href: string;
  /** Light brand-token color for the chip. */
  color: string;
};

const MODES: Mode[] = [
  {
    key: "open",
    label: "Open now",
    icon: Clock4,
    href: "/map?mode=browse&open=now",
    color: "var(--app-positive)",
  },
  {
    key: "walking",
    label: "Walking",
    icon: Footprints,
    // Radius mode IS the walking-from-here surface — preset just
    // sends you there with the default downtown 10-min walk that
    // RadiusBuilder already opens with.
    href: "/map?mode=radius",
    color: "var(--app-cool)",
  },
  {
    key: "practical",
    label: "Practical",
    icon: Wrench,
    href: "/map?mode=browse&intent=civic",
    color: "var(--app-brand-2)",
  },
  {
    key: "rain",
    label: "Rain plan",
    icon: CloudRain,
    href: "/map?mode=browse&intent=arts",
    color: "var(--app-accent)",
  },
  {
    key: "browse",
    label: "Browse all",
    icon: Eye,
    href: "/map?mode=browse",
    color: "var(--app-ink-2)",
  },
];

/**
 * Resolve which preset is currently active from the URL params. If
 * none match, we light up "Browse all" so the user always sees at
 * least one mode as the "current" state.
 */
function activeKey(params: {
  mode?: string;
  open?: string;
  intent?: string;
}): ModeKey {
  if (params.mode === "radius") return "walking";
  if (params.open === "now") return "open";
  if (params.intent === "civic") return "practical";
  if (params.intent === "arts") return "rain";
  return "browse";
}

export default function MapModes({
  params,
}: {
  params: { mode?: string; open?: string; intent?: string };
}) {
  const active = activeKey(params);
  return (
    <nav
      role="navigation"
      aria-label="Map preset modes"
      className="pointer-events-auto -mx-4 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:px-0"
    >
      {MODES.map((m) => {
        const Icon = m.icon;
        const isActive = m.key === active;
        return (
          <Link
            key={m.key}
            href={m.href}
            aria-current={isActive ? "page" : undefined}
            className="snap-start inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition"
            style={{
              background: isActive
                ? `color-mix(in srgb, ${m.color} 14%, var(--app-bg-elevated-solid))`
                : "color-mix(in srgb, var(--app-bg-elevated-solid) 92%, transparent)",
              borderColor: isActive
                ? `color-mix(in srgb, ${m.color} 40%, transparent)`
                : "var(--app-border)",
              color: isActive ? m.color : "var(--app-ink-2)",
              backdropFilter: "blur(12px) saturate(1.15)",
              WebkitBackdropFilter: "blur(12px) saturate(1.15)",
              boxShadow: isActive
                ? `0 2px 6px -2px color-mix(in srgb, ${m.color} 40%, transparent)`
                : "var(--app-elev-1), var(--app-edge), var(--app-hi)",
            }}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}
