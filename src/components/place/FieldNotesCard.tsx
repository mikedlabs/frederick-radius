import FieldStamp from "@/components/ui/FieldStamp";
import { fieldNotesFor, verifiedLabel, type FNSourced } from "@/lib/loaders/fieldNotes";

/**
 * FieldNotesCard — the VERIFIED Field Notes for a place (the moat), on its
 * detail page: happy hour, today-able deals, where to park, and the insider
 * note, each agent-confirmed at a cited source. Carries the FieldStamp
 * certification seal — its truthful home, because every line here IS a
 * source-verified Field Note (unlike the aggregate /today answer cards).
 *
 * Takes precedence over the legacy BusinessExtrasCard; renders nothing when
 * a place has no Field Notes on file (honest empty).
 */

function hostOf(u?: string): string | null {
  if (!u) return null;
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function SourceLink({ href }: { href?: string }) {
  const h = hostOf(href);
  if (!h) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="tap-44 ml-1 inline-flex translate-y-[1px] items-center font-mono text-[9.5px] uppercase tracking-[0.06em] underline decoration-dotted underline-offset-2"
      style={{ color: "var(--app-ink-3)" }}
      aria-label={`Source: ${h}`}
    >
      {h}
    </a>
  );
}

function NoteLine({ label, accent, children }: { label: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span
        className="w-[54px] shrink-0 pt-[3px] font-mono text-[9.5px] font-medium uppercase tracking-[0.09em]"
        style={{ color: accent ? "var(--app-accent)" : "var(--app-ink-3)" }}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 text-[13px] leading-snug" style={{ color: "var(--app-ink)" }}>
        {children}
      </span>
    </div>
  );
}

export default function FieldNotesCard({ slug }: { slug: string }) {
  const fn = fieldNotesFor(slug);
  if (!fn) return null;

  const items: FNSourced[] = [
    ...(fn.happy_hour ? [{ text: fn.happy_hour.schedule, source_url: fn.happy_hour.source_url, last_verified: fn.happy_hour.last_verified }] : []),
    ...(fn.parking ? [fn.parking] : []),
    ...(fn.insider ?? []),
    ...(fn.deals ?? []),
  ];
  const latest = items
    .map((x) => x.last_verified)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();
  const verified = verifiedLabel(latest);

  return (
    <section
      aria-labelledby="fieldnotes-heading"
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
    >
      <FieldStamp id={`fn-${slug}`} top="VERIFIED AT SOURCE" bottom="FIELD NOTES" size={58} className="absolute right-3 top-3" />

      <h3 id="fieldnotes-heading" className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand)" }}>
        Field notes
      </h3>

      <dl className="mt-3 space-y-2.5 pr-14">
        {fn.happy_hour && (
          <NoteLine label="Happy hr" accent>
            <span className="font-semibold">{fn.happy_hour.schedule}</span>
            {fn.happy_hour.details ? <span style={{ color: "var(--app-ink-2)" }}> · {fn.happy_hour.details}</span> : null}
            <SourceLink href={fn.happy_hour.source_url} />
          </NoteLine>
        )}
        {(fn.deals ?? []).slice(0, 3).map((d, i) => (
          <NoteLine key={`deal-${i}`} label={i === 0 ? "Deals" : ""}>
            {d.text}
            <SourceLink href={d.source_url} />
          </NoteLine>
        ))}
        {fn.parking && (
          <NoteLine label="Park">
            <span style={{ color: "var(--app-ink-2)" }}>{fn.parking.text}</span>
            <SourceLink href={fn.parking.source_url} />
          </NoteLine>
        )}
        {(fn.insider ?? []).slice(0, 2).map((n, i) => (
          <NoteLine key={`ins-${i}`} label={i === 0 ? "Note" : ""}>
            <span style={{ color: "var(--app-ink-2)" }}>{n.text}</span>
            <SourceLink href={n.source_url} />
          </NoteLine>
        ))}
      </dl>

      {verified && (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--app-positive)" }}>
          {verified} at the source
        </p>
      )}
    </section>
  );
}
