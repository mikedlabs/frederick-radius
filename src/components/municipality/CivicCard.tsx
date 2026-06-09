import { Phone, Clock, Recycle, ExternalLink } from "lucide-react";
import {
  civicContacts,
  freshnessLabel,
  type MunicipalCivic,
  type CivicContact,
} from "@/lib/loaders/municipalCivic";

/**
 * CivicCard — the town's buried-civic answers, surfaced.
 *
 * Renders the parity-layer data the extraction agent pulls from each
 * town's gov page (town hall, trash/recycling, public works, permits,
 * utilities, police) as a clean, scannable data block — with the SOURCE
 * + FRESHNESS line every civic answer must carry (North Star law #4:
 * "Show the source. Trust is the product.").
 *
 * Returns null when the town has no civic record yet, so the town page
 * is unaffected until the agent (scripts/ingest-municipal-civic.ts)
 * populates that town. Nothing is ever fabricated here.
 */
export default function CivicCard({
  rec,
  hideHeading = false,
}: {
  rec: MunicipalCivic | null;
  /** When mounted inside the merged "Living here" block, the parent owns
   *  the heading — drop CivicCard's own so there's a single heading style. */
  hideHeading?: boolean;
}) {
  if (!rec) return null;
  const contacts = civicContacts(rec);
  if (contacts.length === 0) return null;

  let host = "town site";
  try {
    host = new URL(rec.source.url).hostname.replace(/^www\./, "");
  } catch {
    /* keep fallback */
  }

  return (
    <section className="space-y-2.5">
      {!hideHeading && (
        <div className="flex items-baseline gap-2.5">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Living here
          </span>
          <h2
            className="whitespace-nowrap font-serif text-[19px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            Town hall &amp; services
          </h2>
          <span
            className="relative top-[-2px] h-px flex-1"
            style={{ background: "var(--app-ink-3)", opacity: 0.35 }}
          />
        </div>
      )}

      <div
        className="overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
      >
        <ul>
          {contacts.map((c, i) => (
            <ContactRow key={`${c.label}-${i}`} c={c} last={i === contacts.length - 1} />
          ))}
        </ul>
        {/* Provenance + freshness — the trust line. */}
        <div
          className="flex items-center gap-1.5 border-t px-4 py-2.5 font-mono text-[10px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          <a
            href={rec.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
            style={{ color: "var(--app-ink-2)" }}
          >
            via {host}
            <ExternalLink className="h-2.5 w-2.5" strokeWidth={2.25} aria-hidden />
          </a>
          <span aria-hidden>·</span>
          <span>{freshnessLabel(rec.source.fetchedAt)}</span>
        </div>
      </div>
    </section>
  );
}

function ContactRow({ c, last }: { c: CivicContact; last: boolean }) {
  // Trash/recycling reads as the highest-value resident answer, so its
  // schedule gets a glyph; the rest stay clean text rows.
  const isTrash = /recycl|trash|garbage|refuse/i.test(c.label);
  return (
    <li
      className="px-4 py-3"
      style={{ borderBottom: last ? "none" : "1px solid var(--app-border)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.12em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {c.label}
        </span>
        {c.hours && (
          <span
            className="inline-flex items-center gap-1 text-[12px]"
            style={{ color: "var(--app-ink-2)" }}
          >
            <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
            {c.hours}
          </span>
        )}
      </div>

      {c.schedule && (
        <p
          className="mt-1.5 flex items-start gap-1.5 text-[14px] font-medium"
          style={{ color: "var(--app-ink)" }}
        >
          {isTrash && (
            <Recycle
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              strokeWidth={2}
              style={{ color: "var(--app-brand-2)" }}
              aria-hidden
            />
          )}
          {c.schedule}
        </p>
      )}

      {c.about && !c.schedule && (
        <p className="mt-1 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
          {c.about}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {c.phone && (
          <a
            href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`}
            className="inline-flex items-center gap-1 text-[12px] font-semibold"
            style={{ color: "var(--app-brand)" }}
          >
            <Phone className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            {c.phone}
          </a>
        )}
        {c.website && (
          <a
            href={c.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-medium hover:underline"
            style={{ color: "var(--app-ink-2)" }}
          >
            Website
            <ExternalLink className="h-2.5 w-2.5" strokeWidth={2.25} aria-hidden />
          </a>
        )}
        {c.address && (
          <span className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            {c.address}
          </span>
        )}
      </div>
    </li>
  );
}
