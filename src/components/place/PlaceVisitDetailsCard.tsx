import { ExternalLink } from "lucide-react";
import PlaceSectionLabel from "./PlaceSectionLabel";
import {
  VISIT_UNKNOWN_LABELS,
  type PlaceVisitDetails,
} from "@/lib/loaders/placeVisitDetails";

function checkedDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso));
}

function joinLabels(labels: string[]): string {
  if (labels.length < 2) return labels[0] ?? "";
  if (labels.length === 2) return labels.join(" and ");
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

/** Practical official-source facts. Unknown does not mean unavailable. */
export default function PlaceVisitDetailsCard({
  details,
}: {
  details: PlaceVisitDetails | null;
}) {
  if (!details) return null;
  const sources = [...new Set(details.facts.map((fact) => fact.source_url))];
  const unknowns = details.unknowns.map((key) => {
    const label = VISIT_UNKNOWN_LABELS[key];
    return key === "wifi" ? label : `${label[0].toLowerCase()}${label.slice(1)}`;
  });

  return (
    // PLAIN TOOL: a ruled section on the page ground, not a filled box.
    <section aria-labelledby="place-visit-details">
      <PlaceSectionLabel id="place-visit-details">Before you go</PlaceSectionLabel>
      <ul
        className="mt-2 list-disc space-y-2 pl-4 text-[15px] leading-relaxed"
        style={{ color: "var(--app-ink)" }}
      >
        {details.facts.map((fact) => (
          <li key={fact.text}>
            {fact.text}
            {sources.length > 1 ? (
              <sup className="ml-1 text-[10px]">
                <span aria-hidden>{sources.indexOf(fact.source_url) + 1}</span>
                <span className="sr-only">Source {sources.indexOf(fact.source_url) + 1}</span>
              </sup>
            ) : null}
          </li>
        ))}
      </ul>
      {details.actions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-5">
          {details.actions.map((action) => (
            <a
              key={action.url}
              href={action.url}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-44 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold underline-offset-2 hover:underline"
              style={{ color: "var(--app-link)" }}
            >
              {action.label}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ))}
        </div>
      ) : null}
      {unknowns.length > 0 ? (
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          We have not confirmed {joinLabels(unknowns)}. Check with the venue before your visit.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-3">
        <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          These sources were checked on {checkedDate(details.reviewed_at)}.
        </p>
        {sources.map((url, index) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-44 inline-flex items-center gap-1 text-[13px] underline underline-offset-2"
            style={{ color: "var(--app-ink-2)" }}
          >
            {sources.length === 1 ? "Official source" : `Official source ${index + 1}`}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ))}
      </div>
    </section>
  );
}
