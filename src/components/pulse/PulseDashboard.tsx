"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Siren,
  Construction,
  Zap,
  School,
  AlertTriangle,
  CloudAlert,
  Waves,
  Plane,
  CloudSun,
  Newspaper,
  Radio,
  Shield,
  TrafficCone,
  TrainFront,
  Wind,
  ChevronRight,
  Fish,
  type LucideIcon,
} from "lucide-react";
import BottomDrawer from "@/components/ui/BottomDrawer";

/**
 * PulseDashboard — the /pulse status grid as tap-to-open "little windows".
 *
 * Each live feed (fire & rescue, traffic, power, schools, 311, weather
 * alerts) is one dense tile showing an at-a-glance datum; tapping a tile
 * opens a single controlled bottom sheet with that feed's full detail. This
 * replaces the old pattern — tiles that anchor-scrolled down to a long stack
 * of sections (a second copy of every feed) — so the whole county status is
 * reachable in one tap, zero scroll, and a calm day is a calm screen.
 *
 * The server page renders each feed's rows server-side and hands them in as
 * `body` (a React node) — so this client shell owns only the open/close
 * state + the tiles, and the row-rendering stays one source of truth on the
 * server. `?open=<key>` (e.g. from /today's LivePulse) opens that window on
 * arrival.
 */

const ICONS: Record<string, LucideIcon> = {
  Siren,
  Construction,
  Zap,
  School,
  AlertTriangle,
  CloudAlert,
  Waves,
  Plane,
  CloudSun,
  Newspaper,
  Radio,
  Shield,
  TrafficCone,
  TrainFront,
  Wind,
  Fish,
};

export type PulseTile = {
  key: string;
  label: string;
  /** Icon name resolved against the local map (keeps the server page free of
   *  passing component references across the RSC boundary). */
  iconName: string;
  /** At-a-glance datum, e.g. "3 incidents" / "Clear" / "1,240 out". */
  countLabel: string;
  accent: string;
  /** Feed has live data right now — drives the tile tint + accent strength. */
  active: boolean;
  /** Named source, shown as the drawer subtitle (trust is the product). */
  sourceLabel: string;
  /** Top live item, ONE line — so a glance reads the situation ("I-70 W ·
   *  Incident"), not just a count. Set on active tiles; left undefined on a
   *  clear OPERATIONAL tile so a calm day reads calm. The exception is an
   *  ambient feed like Rivers (active:false) that carries a representative
   *  reading ("Monocacy · 3.2 ft") because the reading IS the point — a peek
   *  here is data, not an alarm, and renders in quiet ink either way. */
  peek?: string;
  /** The feed's detail, rendered inside the tapped window. Server-rendered. */
  body: ReactNode;
};

export default function PulseDashboard({
  tiles,
  initialOpen,
}: {
  tiles: PulseTile[];
  initialOpen?: string;
}) {
  // Deep-link: /pulse?open=traffic (e.g. tapped from /today's LivePulse)
  // opens that feed's window on arrival. Derived once at mount — no effect.
  const [open, setOpen] = useState<string | null>(() =>
    initialOpen && tiles.some((t) => t.key === initialOpen) ? initialOpen : null,
  );

  const current = tiles.find((t) => t.key === open) ?? null;

  return (
    <>
      <section
        aria-label="County status: tap any tile for detail"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {tiles.map((t) => {
          const Icon = ICONS[t.iconName] ?? AlertTriangle;
          // Breathe a soft accent ring on a genuinely-active ALERT tile so a
          // glance reads "this is live." Gated to the danger + warning tones
          // (weather/fire/power/traffic/schools) — the ambient cool tiles
          // (311, rivers) never pulse, so the board stays calm when nothing
          // urgent is on. The ring color rides on --alert-pulse below.
          const pulse = t.active && /danger|warning/.test(t.accent);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setOpen(t.key)}
              aria-haspopup="dialog"
              aria-label={`${t.label}: ${t.countLabel}. Tap for detail.`}
              // Compact horizontal status card — icon BESIDE the text (not
              // stacked above it), so a clear tile is ~2 tight lines instead of
              // a ~110px block. The dashboard packs twice the status per screen
              // and reads as a status board, not a wall of chunky cards.
              // Active tiles still assert (warmer tint + accent band + peek);
              // clear tiles recede into the sunken paper — the heat-map glance
              // is preserved, just denser.
              className={`tactile tactile-interactive relative flex items-start gap-2 overflow-hidden rounded-[var(--app-radius-md)] p-2.5 pr-6 text-left${pulse ? " alert-pulse" : ""}`}
              style={{
                background: t.active
                  ? `color-mix(in srgb, ${t.accent} 12%, var(--app-bg-elevated))`
                  : "var(--app-bg-sunken)",
                boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                ...(pulse ? ({ "--alert-pulse": t.accent } as CSSProperties) : {}),
              }}
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-[3px]"
                style={{ background: t.accent, opacity: t.active ? 1 : 0 }}
              />
              <ChevronRight
                aria-hidden
                className="absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                style={{ color: t.active ? t.accent : "var(--app-ink-3)", opacity: t.active ? 0.8 : 0.35 }}
              />
              <span
                aria-hidden
                className="mt-px grid h-7 w-7 shrink-0 place-items-center rounded-full"
                style={{
                  background: `color-mix(in srgb, ${t.accent} 14%, transparent)`,
                  color: t.accent,
                }}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span
                  className="truncate text-[13px] font-semibold leading-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {t.label}
                </span>
                <span
                  className="font-mono text-[11px] leading-tight tabular-nums"
                  style={{ color: t.active ? t.accent : "var(--app-ink-3)" }}
                >
                  {t.countLabel}
                </span>
                {t.peek && (
                  <span
                    className="line-clamp-1 pt-0.5 text-[11px] leading-snug"
                    style={{ color: "var(--app-ink-2)" }}
                  >
                    {t.peek}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </section>

      <BottomDrawer
        open={open !== null}
        onOpenChange={(o) => {
          if (!o) setOpen(null);
        }}
        title={current?.label ?? ""}
        subtitle={current ? `Source: ${current.sourceLabel}` : undefined}
      >
        <div className="space-y-2 px-4 pb-2">{current?.body}</div>
      </BottomDrawer>
    </>
  );
}
