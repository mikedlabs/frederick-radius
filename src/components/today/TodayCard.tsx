import Link from "next/link";
import { getNwsForecast, iconForShortForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { sunTimes } from "@/lib/sun";
import AnimatedSkyGlyph, { type SkyVariant } from "./AnimatedSkyGlyph";

/**
 * TodayCard — the daily hook at the very top of /now.
 *
 * The product thesis is "less list, more lens": within a few seconds a
 * stranger should get a win and understand why this app exists. This
 * card is that moment. It turns the data the page already has — weather
 * now, today's high, sunset, and tonight's headline event — into one
 * editorial readout plus two situational next-steps, instead of making
 * the user assemble it from scattered modules.
 *
 *   Frederick today
 *   Good morning. Patio weather.
 *   70° now · High 76° · Sunset 8:27 PM
 *   Tonight: Alive @ Five at Carroll Creek
 *   [ Find coffee → ]  [ Open map ]
 *
 * Renders ON the SkyHero gradient (tone-aware via currentColor), so it
 * IS the hero rather than a card stacked on top of one. Server
 * component; the NWS fetch is shared/cached with the rest of the page.
 */

type TonightEvent = {
  slug: string;
  title: string;
  venue_name?: string | null;
} | null;

type Band = "morning" | "midday" | "afternoon" | "evening" | "late";

function easternHour(now: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(now),
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

const GREETING: Record<Band, string> = {
  morning: "Good morning.",
  midday: "Midday.",
  afternoon: "Afternoon.",
  evening: "This evening.",
  late: "Late tonight.",
};

/** A short, confident weather mood line — not cute, just human. */
function moodLine(condition: string, temp: number | null): string {
  const c = condition.toLowerCase();
  if (/thunder|storm/.test(c)) return "Storms around — keep it indoors.";
  if (/rain|shower|drizzle/.test(c)) return "Rain in play. Have a backup plan.";
  if (/snow|sleet|ice|wintry/.test(c)) return "Wintry out. Bundle up.";
  if (/fog|mist|haze/.test(c)) return "Low and gray. Soft light for a walk.";
  if (temp != null && temp >= 88) return "Hot one — chase the shade.";
  if (temp != null && temp <= 38) return "Cold and clear. Layers today.";
  if (/cloud|overcast/.test(c)) return "Soft, gray light over the county.";
  if (temp != null && temp >= 60 && temp <= 84) return "Patio weather.";
  return "A good day to get out.";
}

function fmtTime(d: Date | null): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export default async function TodayCard({
  tonightEvent = null,
}: {
  /** The page already picks the featured/soonest event; passed in so
   *  this card stays a pure composition of existing data. */
  tonightEvent?: TonightEvent;
}) {
  const now = new Date();
  const band = bandFor(easternHour(now));

  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const cur = forecast?.hourly?.[0] ?? null;
  const tempNow = cur?.temperature ?? null;
  const condition = cur?.shortForecast ?? "";
  const high = forecast?.daily?.find((p) => p.isDaytime)?.temperature ?? null;

  // The NEXT sun event, not both — sunrise if it hasn't happened yet,
  // otherwise tonight's sunset, otherwise tomorrow's sunrise. (Replaces
  // the redundant sunrise+sunset footer that duplicated this.)
  const st = sunTimes(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
  let sun: { label: string; time: string } | null = null;
  if (st.sunrise && now < st.sunrise) {
    sun = { label: "Sunrise", time: fmtTime(st.sunrise)! };
  } else if (st.sunset && now < st.sunset) {
    sun = { label: "Sunset", time: fmtTime(st.sunset)! };
  } else {
    const tmrw = sunTimes(new Date(now.getTime() + 86_400_000), FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
    if (tmrw.sunrise) sun = { label: "Sunrise", time: fmtTime(tmrw.sunrise)! };
  }

  const mood = moodLine(condition, tempNow);

  // Daytime by real sun times (the glyph's sun/moon depends on it).
  const isDay = st.sunrise && st.sunset ? now >= st.sunrise && now < st.sunset : true;
  const variant: SkyVariant | null = condition
    ? iconForShortForecast(condition, isDay)
    : null;

  // Secondary stats — high + next sun event. The big temperature carries
  // "now," so it's dropped from this line to avoid saying it twice.
  const stats = [
    high != null ? `High ${high}°` : null,
    sun ? `${sun.label} ${sun.time}` : null,
  ].filter(Boolean);

  return (
    <section aria-label="Today in Frederick" style={{ color: "currentColor" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-meta font-semibold uppercase tracking-[0.14em] opacity-70">
            Frederick today
          </p>
          {/* The hook — greeting + a confident weather mood, in the display
              face. This is the 3-second "I get it" line. */}
          <h2 className="mt-1 font-serif text-[24px] font-semibold leading-tight tracking-tight sm:text-[28px]">
            {GREETING[band]} {mood}
          </h2>
        </div>
        {/* The animated weather glyph — the atmospheric visual the hero used
            to carry. CSS-only (no JS), sized as the hero icon, riding on the
            sky gradient. */}
        {variant && (
          <AnimatedSkyGlyph variant={variant} size={60} className="-mt-1 shrink-0 opacity-95" />
        )}
      </div>

      {/* The dramatic temperature — thin display serif, the iOS-weather
          register the old hero had. Pairs the big "now" with the small
          high/sunset stats so the number reads first. */}
      {tempNow != null ? (
        <div className="mt-1.5 flex items-end gap-3">
          <span className="font-serif text-[56px] font-light leading-[0.85] tracking-tight tabular-nums sm:text-[64px]">
            {tempNow}&deg;
          </span>
          {stats.length > 0 && (
            <span className="pb-1.5 text-body font-medium tabular-nums opacity-90">
              {stats.join("  ·  ")}
            </span>
          )}
        </div>
      ) : (
        stats.length > 0 && (
          <p className="mt-1.5 text-body font-medium tabular-nums opacity-90">
            {stats.join("  ·  ")}
          </p>
        )
      )}

      {tonightEvent && (
        <p className="mt-1 text-body opacity-80">
          {band === "evening" || band === "late" ? "Tonight" : "Coming up"}:{" "}
          <Link
            href={`/events/${tonightEvent.slug}`}
            className="font-semibold underline decoration-[1.5px] underline-offset-2"
          >
            {tonightEvent.title}
          </Link>
          {tonightEvent.venue_name ? ` at ${tonightEvent.venue_name}` : ""}
        </p>
      )}

    </section>
  );
}
