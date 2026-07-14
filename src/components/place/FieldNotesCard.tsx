import { Clock3, Tag, Car, Lightbulb, type LucideIcon } from "lucide-react";
import FieldStamp from "@/components/ui/FieldStamp";
import { fieldNotesFor, verifiedLabel, type FNSourced } from "@/lib/loaders/fieldNotes";

/**
 * FieldNotesCard — the VERIFIED Field Notes for a place (the moat).
 *
 * Icon-led, not label-led: each line is anchored by a small tinted glyph
 * (happy hour / deal / parking / insider) instead of a mono label column, so
 * the card reads as a few scannable facts rather than a wall of text. Long
 * parking/insider notes are clamped. Every source is collapsed into ONE
 * footer line ("verified 1d ago · via x.com") next to the certification seal,
 * instead of a link after every row. Self-hides when a place has no notes.
 */

function hostOf(u?: string): string | null {
  if (!u) return null;
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function Row({
  icon: Icon,
  tint,
  lead,
  children,
  clamp,
}: {
  icon: LucideIcon;
  tint: string;
  lead?: string;
  children: React.ReactNode;
  clamp?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${tint} 15%, transparent)`, color: tint }}
      >
        <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
      </span>
      <span className={`min-w-0 flex-1 text-[13.5px] leading-snug ${clamp ? "line-clamp-2" : ""}`} style={{ color: "var(--app-ink-2)" }}>
        {lead && <span className="font-semibold" style={{ color: "var(--app-ink)" }}>{lead} </span>}
        {children}
      </span>
    </li>
  );
}

export default function FieldNotesCard({ slug }: { slug: string }) {
  const fn = fieldNotesFor(slug);
  if (!fn) return null;

  const all: FNSourced[] = [
    ...(fn.happy_hour ? [{ text: fn.happy_hour.schedule, source_url: fn.happy_hour.source_url, last_verified: fn.happy_hour.last_verified }] : []),
    ...(fn.deals ?? []),
    ...(fn.parking ? [fn.parking] : []),
    ...(fn.insider ?? []),
  ];
  const latest = all.map((x) => x.last_verified).filter((d): d is string => Boolean(d)).sort().pop();
  const verified = verifiedLabel(latest);
  const hosts = Array.from(new Set(all.map((x) => hostOf(x.source_url)).filter((h): h is string => Boolean(h)))).slice(0, 2);

  return (
    <section
      aria-labelledby="fieldnotes-heading"
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
    >
      <div className="flex items-center gap-2">
        <h2 id="fieldnotes-heading" className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand-press)" }}>
          Field notes
        </h2>
        <span aria-hidden className="h-px flex-1" style={{ background: "var(--app-border)" }} />
      </div>

      <ul className="mt-3 space-y-3">
        {fn.happy_hour && (
          <Row icon={Clock3} tint="var(--app-accent)" lead="Happy hour">
            <span className="font-medium" style={{ color: "var(--app-ink)" }}>{fn.happy_hour.schedule}</span>
            {fn.happy_hour.details ? <span> · {fn.happy_hour.details}</span> : null}
          </Row>
        )}
        {(fn.deals ?? []).slice(0, 3).map((d, i) => (
          <Row key={`deal-${i}`} icon={Tag} tint="var(--app-brand)">
            <span className="font-medium" style={{ color: "var(--app-ink)" }}>{d.text}</span>
          </Row>
        ))}
        {fn.parking && (
          <Row icon={Car} tint="var(--app-cool)" lead="Park" clamp>
            {fn.parking.text}
          </Row>
        )}
        {(fn.insider ?? []).slice(0, 2).map((n, i) => (
          <Row key={`ins-${i}`} icon={Lightbulb} tint="var(--app-brand-2)" clamp>
            {n.text}
          </Row>
        ))}
      </ul>

      {/* One footer line carries the trust — the seal + a single source line,
          instead of a link after every row. */}
      {(verified || hosts.length > 0) && (
        <div className="mt-3.5 flex items-center gap-2.5 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
          <FieldStamp id={`fn-${slug}`} top="VERIFIED" bottom="FIELD NOTES" size={40} className="-my-1 shrink-0" />
          <p className="min-w-0 text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            {verified && <span style={{ color: "var(--app-positive)" }}>{verified} at the source</span>}
            {hosts.length > 0 && (
              <>
                {verified ? " · " : ""}via{" "}
                {hosts.map((h, i) => (
                  <span key={h}>
                    {i > 0 ? ", " : ""}
                    {h}
                  </span>
                ))}
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
