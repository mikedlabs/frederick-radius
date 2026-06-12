import Link from "next/link";
import { rankPlaces, countOpenNow, type PlaceCardData } from "@/lib/loaders/places";
import { allUpcoming, eventsLive } from "@/lib/loaders/events";
import { sunTimes } from "@/lib/sun";
import { FREDERICK_CENTER } from "@/lib/geo";
import Masthead from "./components/Masthead";
import AlmanacLine from "./components/AlmanacLine";
import { Plate, IndexRow } from "./components/cards";

export const dynamic = "force-dynamic";

const ET = "America/New_York";

function hhmm(d: Date | null): string {
  if (!d) return "--:--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function dayParts(now: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "long" }).format(now);
  const date = new Intl.DateTimeFormat("en-US", { timeZone: ET, month: "long", day: "numeric" }).format(now);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", hour12: false }).format(now));
  const slot = hour < 11 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return { weekday, date, slot };
}

/** Lead pick: an open, photographed destination ranked by the visitor
 *  recipe, so the cover always leads with somewhere worth going now. */
function pickLead(now: Date): { lead?: PlaceCardData; rest: PlaceCardData[] } {
  const ranked = rankPlaces({
    origin: FREDERICK_CENTER,
    now,
    preferOpen: true,
    profile: "visitor",
    limit: 60,
  });
  const photogenic = ranked.filter((p) => p.google_photo_url && p.open_status.state === "open");
  const lead = photogenic[0] ?? ranked[0];
  const rest = ranked.filter((p) => p.slug !== lead?.slug).slice(0, 6);
  return { lead, rest };
}

export default function LabAHome() {
  const now = new Date();
  const { weekday, date, slot } = dayParts(now);
  const { lead, rest } = pickLead(now);
  const openCount = countOpenNow(now);
  const sun = sunTimes(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);

  const live = eventsLive(now)[0];
  const upcoming = allUpcoming(now, 1)[0];
  const leadEvent = live ?? upcoming;

  const facts = [
    `SUNSET ${hhmm(sun.sunset)}`,
    `${openCount} OPEN NOW`,
    leadEvent ? `TONIGHT: ${leadEvent.title.toUpperCase().slice(0, 28)}` : "QUIET EVENING",
  ];

  const slotLine =
    slot === "morning"
      ? "Where to start the day."
      : slot === "afternoon"
        ? "Where the afternoon goes."
        : "Where tonight is good.";

  return (
    <main className="pb-16">
      <Masthead />
      <AlmanacLine facts={facts} />

      {/* The cover headline: today as an issue. */}
      <div className="px-[var(--a-gutter)] pt-7">
        <p className="lab-a-mono uppercase tracking-[0.2em]" style={{ fontSize: "var(--a-size-label)", color: "var(--a-ink-3)" }}>
          {weekday}, {date}
        </p>
        <h1 className="lab-a-display pt-2" style={{ fontSize: "var(--a-size-title)" }}>
          {slotLine}
        </h1>
      </div>

      {/* The single lead Plate. */}
      {lead && (
        <div className="pt-7">
          <p
            className="lab-a-mono px-[var(--a-gutter)] pb-3 uppercase tracking-[0.2em]"
            style={{ fontSize: "var(--a-size-label)", color: "var(--a-ink-3)" }}
          >
            The pick
          </p>
          <Plate p={lead} href={`/labs/a/place/${lead.slug}`} />
        </div>
      )}

      {/* The tight index under the lead. Hairline rules, no boxes. */}
      <div className="pt-9">
        <p
          className="lab-a-mono px-[var(--a-gutter)] pb-1 uppercase tracking-[0.2em]"
          style={{ fontSize: "var(--a-size-label)", color: "var(--a-ink-3)" }}
        >
          Also open now
        </p>
        <div className="lab-a-rule" />
        {rest.map((p) => (
          <div key={p.slug}>
            <IndexRow p={p} href={`/labs/a/place/${p.slug}`} />
            <div className="lab-a-rule" />
          </div>
        ))}
      </div>

      {/* The one primary action. The single vermilion element on the screen. */}
      <div className="px-[var(--a-gutter)] pt-8">
        <Link
          href="/labs/a/map"
          className="lab-a-primary flex h-12 w-full items-center justify-center"
          style={{ fontSize: "var(--a-size-body)" }}
        >
          Open the map
        </Link>
        <Link
          href="/labs/a/guide"
          className="mt-3 flex h-12 w-full items-center justify-center rounded-full"
          style={{ fontSize: "var(--a-size-body)", color: "var(--a-ink)", boxShadow: "inset 0 0 0 1px var(--a-rule)" }}
        >
          Help me decide
        </Link>
      </div>
    </main>
  );
}
