import Link from "next/link";
import { Coffee, MoonStar, Umbrella, Footprints, Sun, Snowflake, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * TodayMoves — the command center (Review #2's headline ask).
 *
 * Instead of opening on a weather dashboard and a stack of modules, the
 * page leads with a confident answer to "what's the move?": one primary,
 * weather-and-time-aware suggestion, plus Tonight (events starting soon)
 * and Near you (what's within a short walk). Everything else — the full
 * weather panel, mood tiles, the events shelf — collapses underneath.
 *
 * The "best move" is rule-based and honest (time-of-day × conditions),
 * not a fake ML score — it composes signals the page already loads.
 * Server component; the NWS fetch is cached/shared with the rest of /today.
 */

type Band = "morning" | "midday" | "afternoon" | "evening" | "late";

function easternHour(now: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(now),
    10,
  );
}
function bandFor(h: number): Band {
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 14) return "midday";
  if (h >= 14 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "late";
}

type Move = { eyebrow: string; title: string; sub: string; href: string; icon: LucideIcon };

/** The single best move, by conditions then time-of-day. Confident,
 *  not cute — each one is a real thing to go do right now. */
function bestMove(
  band: Band,
  condition: string,
  temp: number | null,
  tonightEvent: { slug: string; title: string; venue_name?: string | null } | null,
): Move {
  const c = condition.toLowerCase();
  const wet = /rain|shower|drizzle|thunder|storm/.test(c);
  const cold = temp != null && temp <= 38;
  const hot = temp != null && temp >= 88;

  // Bad weather wins over everything — send people somewhere dry/warm.
  if (wet) {
    return {
      eyebrow: "Best move now",
      title: "Duck inside somewhere good",
      sub: "Rain's in play. A museum, a long coffee, a bookshop.",
      href: "/category/coffee",
      icon: Umbrella,
    };
  }
  if (cold) {
    return {
      eyebrow: "Best move now",
      title: "Warm up downtown",
      sub: "Cold out. Coffee, a cozy lunch, somewhere with a fire.",
      href: "/category/coffee",
      icon: Snowflake,
    };
  }
  // Evening: lead with tonight's headline event if there is one.
  if ((band === "evening" || band === "late") && tonightEvent) {
    return {
      eyebrow: "Best move tonight",
      title: tonightEvent.title,
      sub: tonightEvent.venue_name ? `Tonight at ${tonightEvent.venue_name}` : "Happening tonight nearby",
      href: `/events/${tonightEvent.slug}`,
      icon: MoonStar,
    };
  }
  if (band === "evening" || band === "late") {
    return {
      eyebrow: "Best move now",
      title: "Dinner & a walk downtown",
      sub: "Eat on Market Street, then stroll Carroll Creek.",
      href: "/category/eat",
      icon: MoonStar,
    };
  }
  if (hot) {
    return {
      eyebrow: "Best move now",
      title: "Chase the shade",
      sub: "Hot one. A creekside walk, a patio, somewhere cool.",
      href: "/map?mode=radius",
      icon: Sun,
    };
  }
  if (band === "morning") {
    return {
      eyebrow: "Best move now",
      title: "Coffee, then Carroll Creek",
      sub: "Good light for it. Grab a cup and walk the creek.",
      href: "/category/coffee",
      icon: Coffee,
    };
  }
  // Midday / afternoon, fair weather.
  return {
    eyebrow: "Best move now",
    title: "Get outside while it's nice",
    sub: "Patio weather. A walk, a park, lunch out.",
    href: "/map?mode=radius",
    icon: Footprints,
  };
}

export default async function TodayMoves({
  tonightEvent = null,
}: {
  tonightEvent?: { slug: string; title: string; venue_name?: string | null } | null;
}) {
  const now = new Date();
  const band = bandFor(easternHour(now));
  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const cur = forecast?.hourly?.[0] ?? null;
  const move = bestMove(band, cur?.shortForecast ?? "", cur?.temperature ?? null, tonightEvent);
  const PrimaryIcon = move.icon;

  return (
    <section aria-label="What's the move" className="space-y-2">
      {/* Primary move — the confident lead answer. */}
      <Link
        href={move.href}
        className="tactile tactile-interactive group block rounded-[var(--app-radius-lg)] p-4"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--app-brand) 20%, var(--app-bg-elevated)), var(--app-bg-elevated))",
        }}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{ background: "var(--app-brand)", color: "#fff" }}
          >
            <PrimaryIcon className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-meta font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-brand)" }}>
              {move.eyebrow}
            </p>
            <h2 className="mt-0.5 font-serif text-[19px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
              {move.title}
            </h2>
            <p className="mt-0.5 text-body" style={{ color: "var(--app-ink-2)" }}>
              {move.sub}
            </p>
          </div>
          <ArrowRight
            className="mt-1 h-4 w-4 shrink-0 transition-transform group-active:translate-x-0.5"
            strokeWidth={2.25}
            style={{ color: "var(--app-ink-3)" }}
            aria-hidden
          />
        </div>
      </Link>
    </section>
  );
}
