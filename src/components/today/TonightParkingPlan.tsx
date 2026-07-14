import Link from "next/link";
import { CircleParking } from "lucide-react";

/**
 * Tonight's parking play — a quiet, self-hiding line on /today.
 *
 * When a crowd-drawing event is coming up downtown, the closest garage tends to
 * fill, so this names it and offers the backups: "Heading to [event]? Carroll
 * Creek Deck fills fast. Court Street and Church Street are good backups." It's
 * the same predictive logic the parking-forecast push uses, surfaced on the
 * page for anyone who didn't opt into alerts. A PREDICTION ("fills fast"), never
 * a live count. Renders nothing when no qualifying event is near (the slot in
 * /today passes null then).
 */
export default function TonightParkingPlan({
  eventTitle,
  eventSlug,
  primaryGarageName,
  alternatives,
}: {
  eventTitle: string;
  eventSlug: string;
  primaryGarageName: string;
  alternatives: string[];
}) {
  const backups =
    alternatives.length >= 2
      ? `${alternatives[0]} and ${alternatives[1]} are good backups.`
      : alternatives.length === 1
        ? `${alternatives[0]} is a good backup.`
        : "Arrive early or have a backup in mind.";
  return (
    <div className="mt-3">
      <div
        className="flex items-start gap-3 rounded-[var(--app-radius-lg)] border p-3.5"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
            color: "var(--app-brand)",
          }}
        >
          <CircleParking className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <p className="text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          <span className="font-semibold" style={{ color: "var(--app-ink)" }}>
            Heading to{" "}
            <Link href={`/events/${eventSlug}`} style={{ color: "var(--app-brand-press)" }}>
              {eventTitle}
            </Link>
            ?
          </span>{" "}
          {primaryGarageName} fills fast. {backups}{" "}
          <Link href="/parking" className="font-semibold whitespace-nowrap" style={{ color: "var(--app-brand-press)" }}>
            Parking guide →
          </Link>
        </p>
      </div>
    </div>
  );
}
