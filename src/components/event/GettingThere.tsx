import { CarFront, TrainFront } from "lucide-react";
import { fieldNotesFor, recordedFieldNoteVerificationDate } from "@/lib/loaders/fieldNotes";
import { eventParkingDirections, type EventParkingDecision } from "@/lib/events/parking";
import { BRUNSWICK_CANCELLATION, COUNTY_TRANSIT_BULLETIN_URL, MARC_HOLIDAY_URL, brunswickCancelled, countyTransitException } from "@/lib/transit-service-calendar";
import { eventNearbyStation } from "@/lib/events/travel";
import Link from "next/link";
import PlaceSectionLabel from "@/components/place/PlaceSectionLabel";

/** Source-backed venue notes and coordinate proximity, with no route or service assumptions. */
export default function GettingThere({ geom, venuePlaceSlug, geoPrecise, parkingDecision, eventDay }: {
  geom: { lng: number; lat: number };
  venuePlaceSlug?: string;
  geoPrecise: boolean;
  eventDay?: string;
  parkingDecision: EventParkingDecision | null;
}) {
  const parkingNote = venuePlaceSlug ? fieldNotesFor(venuePlaceSlug)?.parking : undefined;
  const verified = recordedFieldNoteVerificationDate(parkingNote?.last_verified);
  const garageLine = parkingNote ? null : eventParkingDirections(parkingDecision, eventDay);
  const station = geoPrecise ? eventNearbyStation(geom) : null;
  const notice = eventDay ? countyTransitException(eventDay) : null;
  const noTrain = Boolean(eventDay && brunswickCancelled(eventDay));
  if (!parkingNote && !garageLine && !station && !notice) return null;

  return (
    <section aria-label="Getting there" className="max-w-[720px] border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
      {/* Same shared label and compact ink body as "Around the event" above it. */}
      <PlaceSectionLabel as="h2">Getting there</PlaceSectionLabel>
      <ul className="mt-1.5 space-y-1.5 text-[13px] leading-snug" style={{ color: "var(--app-ink)" }}>
        {(parkingNote || garageLine) && (
          <li className="flex items-start gap-2.5">
            <CarFront className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-2)" }} aria-hidden />
            <div className="min-w-0">
              <p>{parkingNote?.text ?? garageLine}</p>
              <div className="flex flex-wrap items-center gap-x-3 text-[12px]">
                {parkingNote?.source_url && <a href={parkingNote.source_url} target="_blank" rel="noopener noreferrer" className="tap-44 inline-flex items-center font-semibold underline" style={{ color: "var(--app-cool-text)" }}>Parking source</a>}
                {verified && <span style={{ color: "var(--app-ink-3)" }}>Checked {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date(verified))}</span>}
                {!parkingNote && parkingDecision && <Link prefetch={false} href={`/places/${parkingDecision.slug}`} className="tap-44 inline-flex items-center font-semibold underline" style={{ color: "var(--app-cool-text)" }}>See garage &amp; directions</Link>}
                {!parkingNote && <Link prefetch={false} href="/parking" className="tap-44 inline-flex items-center font-semibold underline" style={{ color: "var(--app-cool-text)" }}>Check parking rates</Link>}
              </div>
            </div>
          </li>
        )}
        {notice && <li><p>{notice.text}</p><a className="tap-44 inline-flex items-center text-[12px] font-semibold underline" href={COUNTY_TRANSIT_BULLETIN_URL}>County transit bulletin (PDF)</a></li>}
        {station && (
          <li className="flex items-start gap-2.5">
            <TrainFront className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-2)" }} aria-hidden />
            <div className="min-w-0">
              <p>{station.name} MARC station is {station.distanceLabel} away in a straight line. {noTrain ? BRUNSWICK_CANCELLATION : "Check outbound and return service for the event date before planning the trip."}</p>
              <a href={noTrain ? MARC_HOLIDAY_URL : "/transit"} className="tap-44 inline-flex items-center text-[12px] font-semibold underline" style={{ color: "var(--app-cool-text)" }}>{noTrain ? "MARC holiday schedule" : "Check train schedules"}</a>
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}
