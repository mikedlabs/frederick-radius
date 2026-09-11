import { Phone, Clock, Recycle, ExternalLink, Landmark } from "lucide-react";
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

/** Most-repeated non-empty value, only when it actually repeats (>= 2). */
function sharedValue(vals: Array<string | undefined>): string | undefined {
  const counts = new Map<string, number>();
  for (const v of vals) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestN = 1;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

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

  // Town-hall departments (hall, permits, utilities) usually share ONE office
  // phone + address. Surface that once as a "Main office" line and drop it from
  // the individual rows, so the card lists departments cleanly instead of
  // repeating the same address on every entry.
  const sharedPhone = sharedValue(contacts.map((c) => c.phone));
  const sharedAddress = sharedValue(contacts.map((c) => c.address));

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
        {/* Shared "Main office" contact — shown ONCE, not on every row. */}
        {(sharedPhone || sharedAddress) && (
          <div
            className="flex items-start gap-2.5 border-b px-4 py-3"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
          >
            <Landmark
              className="mt-0.5 h-4 w-4 shrink-0"
              strokeWidth={2}
              style={{ color: "var(--app-cool)" }}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
                Main office
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {sharedPhone && (
                  <a
                    href={`tel:${sharedPhone.replace(/[^0-9+]/g, "")}`}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold"
                    style={{ color: "var(--app-brand-press)" }}
                  >
                    <Phone className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                    {sharedPhone}
                  </a>
                )}
                {sharedAddress && (
                  <span className="text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
                    {sharedAddress}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <ul>
          {contacts.map((c, i) => (
            <ContactRow
              key={`${c.label}-${i}`}
              c={c}
              last={i === contacts.length - 1}
              sharedPhone={sharedPhone}
              sharedAddress={sharedAddress}
            />
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

function ContactRow({
  c,
  last,
  sharedPhone,
  sharedAddress,
}: {
  c: CivicContact;
  last: boolean;
  sharedPhone?: string;
  sharedAddress?: string;
}) {
  // Trash/recycling reads as the highest-value resident answer, so its
  // schedule gets a glyph; the rest stay clean text rows.
  const isTrash = /recycl|trash|garbage|refuse/i.test(c.label);
  // Suppress the phone/address that already live in the "Main office" line
  // above — a department row only shows what's UNIQUE to it.
  const showPhone = Boolean(c.phone && c.phone !== sharedPhone);
  const showAddress = Boolean(c.address && c.address !== sharedAddress);
  const hasDetailRow = showPhone || Boolean(c.website) || showAddress;
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

      {hasDetailRow && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {showPhone && (
            <a
              href={`tel:${c.phone!.replace(/[^0-9+]/g, "")}`}
              className="inline-flex items-center gap-1 text-[12px] font-semibold"
              style={{ color: "var(--app-brand-press)" }}
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
          {showAddress && (
            <span className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              {c.address}
            </span>
          )}
        </div>
      )}
    </li>
  );
}
