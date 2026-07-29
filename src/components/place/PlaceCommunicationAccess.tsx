import { Accessibility, ExternalLink } from "lucide-react";
import type { Place } from "@/data/places";

function communicationLabels(
  communication: NonNullable<
    NonNullable<Place["accessibility"]>["communication"]
  >,
): string[] {
  return [
    communication.deaf_community ? "Deaf-community place" : null,
    communication.asl_environment ? "ASL-rich environment" : null,
    communication.asl_interpretation ? "ASL interpretation" : null,
    communication.captions ? "Captions" : null,
    communication.assistive_listening ? "Assistive listening" : null,
    communication.relay_supported ? "Relay supported" : null,
    communication.written_contact ? "Written contact available" : null,
    communication.videophone ? "Videophone" : null,
  ].filter((label): label is string => Boolean(label));
}

function checkedLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return "Official source";
  return `Source checked ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)}`;
}

/**
 * Verified communication access, shown in the ordinary place journey.
 * Missing fields stay unknown; the component never promotes a general
 * accessibility tag into an ASL, captioning, or interpreter claim.
 */
export default function PlaceCommunicationAccess({
  place,
}: {
  place: Pick<Place, "accessibility">;
}) {
  const communication = place.accessibility?.communication;
  if (!communication) return null;
  const labels = communicationLabels(communication);
  if (labels.length === 0) return null;

  return (
    <section
      aria-labelledby="place-communication-access"
      className="rounded-[var(--app-radius-md)] border px-3.5 py-3"
      style={{
        borderColor:
          "color-mix(in srgb, var(--app-cool) 30%, var(--app-border))",
        background:
          "color-mix(in srgb, var(--app-cool) 7%, var(--app-bg-elevated))",
      }}
    >
      <div className="flex items-start gap-2.5">
        <Accessibility
          className="mt-0.5 h-4 w-4 shrink-0"
          strokeWidth={2}
          style={{ color: "var(--app-cool)" }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h3
            id="place-communication-access"
            className="text-[12.5px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            Communication access
          </h3>
          <p
            className="mt-0.5 text-[12px] leading-snug"
            style={{ color: "var(--app-ink-2)" }}
          >
            {labels.join(" · ")}
          </p>
          {communication.notes ? (
            <p
              className="mt-1 text-[11px] leading-snug"
              style={{ color: "var(--app-ink-3)" }}
            >
              {communication.notes}
            </p>
          ) : null}
          <a
            href={communication.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-44-y mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium underline"
            style={{ color: "var(--app-cool)" }}
          >
            {checkedLabel(communication.verified_at)}
            <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
