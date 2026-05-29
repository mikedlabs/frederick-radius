import Link from "next/link";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { sunTimes } from "@/lib/sun";

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
  const sunset = fmtTime(sunTimes(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng).sunset);

  const mood = moodLine(condition, tempNow);

  // Data readout pieces, joined with middots so empty ones drop out.
  const readout = [
    tempNow != null ? `${tempNow}° now` : null,
    high != null ? `High ${high}°` : null,
    sunset ? `Sunset ${sunset}` : null,
  ].filter(Boolean);

  return (
    <section aria-label="Today in Frederick" style={{ color: "currentColor" }}>
      <p className="text-meta font-semibold uppercase tracking-[0.14em] opacity-70">
        Frederick today
      </p>

      {/* The hook — greeting + a confident weather mood, in the display
          face. This is the 3-second "I get it" line. */}
      <h1 className="mt-1 font-serif text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">
        {GREETING[band]} {mood}
      </h1>

      {readout.length > 0 && (
        <p className="mt-1.5 text-body font-medium tabular-nums opacity-90">
          {readout.join("  ·  ")}
        </p>
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
