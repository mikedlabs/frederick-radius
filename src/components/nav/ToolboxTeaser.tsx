import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  AMENITY_MAP_TOOLS,
  RADIUS_TOOL_GROUPS,
  RADIUS_TOOLS,
  type RadiusToolTone,
} from "@/data/radius-tools";

/**
 * ToolboxTeaser — a calm, low entry point into the full Compass directory,
 * placed near the bottom of /today. It answers the owner note that "lots of
 * useful tools aren't being linked": every subject group is one tap away as a
 * labelled chip that deep-links into its Compass section, without turning the
 * front door into a menu. Server component: pure static links, no client cost.
 */

/** One representative tone per subject group, so a chip carries a quiet accent
 *  dot in the section's own color. */
const GROUP_TONE: Record<string, RadiusToolTone> = {
  "eat-drink": "brand",
  "get-around": "cool",
  outdoors: "positive",
  essentials: "civic",
  "events-plans": "accent",
  civic: "civic",
  "county-data": "cool",
  explore: "accent",
  yours: "brand",
  contribute: "positive",
};

const TONE_COLOR: Record<RadiusToolTone, string> = {
  accent: "var(--app-accent-press)",
  brand: "var(--app-brand-press)",
  civic: "var(--app-civic)",
  cool: "var(--app-cool)",
  positive: "var(--app-positive)",
};

export default function ToolboxTeaser() {
  return (
    <section
      aria-labelledby="toolbox-teaser-heading"
      className="mt-5 rounded-[var(--app-radius-lg)] border p-4"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="eyebrow" style={{ color: "var(--app-brand-press)" }}>
            The toolbox
          </p>
          <h2
            id="toolbox-teaser-heading"
            className="mt-1 font-serif text-[18px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Open any Radius tool
          </h2>
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {RADIUS_TOOLS.length} tools
        </span>
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {RADIUS_TOOL_GROUPS.map((group) => {
          const color = TONE_COLOR[GROUP_TONE[group.id] ?? "brand"];
          return (
            <li key={group.id}>
              <Link
                href={`/compass#cat-${group.id}`}
                prefetch={false}
                className="tactile-interactive flex min-h-11 items-center gap-2 rounded-full border px-3 text-[12.5px] font-semibold outline-none transition hover:bg-[var(--app-bg-sunken)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                {group.label}
                <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                  {group.tools.length}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Public amenities get their own labelled chip row (owner call): the
          mapped essentials are named directly on the front door, each opening
          the map to that layer, instead of hiding behind one category chip. */}
      <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Public amenities
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {AMENITY_MAP_TOOLS.map((tool) => (
            <li key={tool.id}>
              <Link
                href={tool.href}
                prefetch={false}
                className="tactile-interactive flex min-h-11 items-center rounded-full border px-3 text-[12.5px] font-semibold outline-none transition hover:bg-[var(--app-bg-sunken)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
              >
                {tool.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <Link
        href="/compass"
        prefetch={false}
        className="tap-44-y mt-4 inline-flex items-center gap-1 px-0.5 text-[13px] font-semibold"
        style={{ color: "var(--app-brand-press)" }}
      >
        Browse all tools
        <ArrowRight className="h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} aria-hidden />
      </Link>
    </section>
  );
}
