import { CarFront, TrainFront } from "lucide-react";
import { fieldNotesFor, recordedFieldNoteVerificationDate } from "@/lib/loaders/fieldNotes";
import { eventParkingDirections, type EventParkingDecision } from "@/lib/events/parking";
import { eventNearbyStation } from "@/lib/events/travel";
import Link from "next/link";

/** Source-backed venue notes and coordinate proximity, with no route or service assumptions. */
export default function GettingThere({ geom, venuePlaceSlug, geoPrecise, parkingDecision }: {
  geom: { lng: number; lat: number };
  venuePlaceSlug?: string;
  geoPrecise: boolean;
  parkingDecision: EventParkingDecision | null;
}) {
  const parkingNote = venuePlaceSlug ? fieldNotesFor(venuePlaceSlug)?.parking : undefined;
  const verified = recordedFieldNoteVerificationDate(parkingNote?.last_verified);
  const garageLine = parkingNote ? null : eventParkingDirections(parkingDecision);
  const station = geoPrecise ? eventNearbyStation(geom) : null;
  if (!parkingNote && !garageLine && !station) return null;

  return (
    <section aria-label="Getting there" className="space-y-3 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
      <h2 className="text-[16px] font-semibold" style={{ color: "var(--app-ink)" }}>Getting there</h2>
      <ul className="space-y-3 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        {(parkingNote || garageLine) && (
          <li className="flex items-start gap-2.5">
            <CarFront className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--app-cool)" }} aria-hidden />
            <div>
              <p>{parkingNote?.text ?? garageLine}</p>
              <div className="flex flex-wrap items-center gap-x-3 text-[12px]">
                {parkingNote?.source_url && <a href={parkingNote.source_url} target="_blank" rel="noopener noreferrer" className="tap-44 inline-flex items-center font-semibold underline" style={{ color: "var(--app-cool)" }}>Parking source</a>}
                {verified && <span>Checked {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date(verified))}</span>}
                {!parkingNote && parkingDecision && <Link href={`/places/${parkingDecision.slug}`} className="tap-44 inline-flex items-center font-semibold underline" style={{ color: "var(--app-cool)" }}>See garage &amp; directions</Link>}
                {!parkingNote && <Link href="/parking" className="tap-44 inline-flex items-center font-semibold underline" style={{ color: "var(--app-cool)" }}>Check parking rates</Link>}
              </div>
            </div>
          </li>
        )}
        {station && (
          <li className="flex items-start gap-2.5">
            <TrainFront className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--app-cool)" }} aria-hidden />
            <div>
              <p>{station.name} MARC station is {station.distanceLabel} away in a straight line. Check outbound and return service for the event date before planning the trip.</p>
              <Link href="/transit" className="tap-44 inline-flex items-center text-[12px] font-semibold underline" style={{ color: "var(--app-cool)" }}>Check train schedules</Link>
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}
