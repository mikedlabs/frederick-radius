import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * A framed Today section with the field-guide plate header.
 *
 * The "Hide" affordance this component used to carry was retired: its
 * restore surface (HiddenSectionsBar) had already been removed from /today,
 * so one accidental tap — the button sat right next to "See all" — hid the
 * page's headline section PERMANENTLY on that device with no way back. With
 * /today down to a single dismissible section, the hide feature was all trap
 * and no value. The stored hidden state is deliberately ignored now, so
 * anyone previously trapped gets the section back. (`id` is kept for section
 * anchors/analytics continuity.)
 */
export default function DismissibleSection({
  id,
  title,
  href,
  cta = "See all",
  meta,
  eyebrow,
  plateNo,
  flat = false,
  children,
}: {
  id: string;
  title: string;
  href?: string;
  cta?: string;
  meta?: React.ReactNode;
  /** Field-guide eyebrow — a small tracked plate label above the title
   *  (e.g. "WHAT'S ON"). Opt-in; omit for the plain header. */
  eyebrow?: string;
  /** Field-guide plate index (e.g. "No. 03"), shown at the far right of
   *  the header rule. Opt-in. */
  plateNo?: string;
  /** Use page structure instead of another raised card. */
  flat?: boolean;
  children: React.ReactNode;
}) {
  void id;
  return (
    <section
      className={flat
        ? "relative border-t pt-4"
        : `relative rounded-[var(--app-radius-lg)] border p-4${eyebrow || plateNo ? " fg-plate" : ""}`}
      style={flat
        ? { borderColor: "var(--app-border)" }
        : {
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated)",
            boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-1)",
          }}
    >
      {/* Card-bounded section per the brief: "areas need to be
          defined more." The hairline + inner-shadow treatment marks
          each section as a discrete room a visitor can walk into,
          not another stack on a long page. When a field-guide eyebrow
          is set, the header reads like a plate caption — tracked label,
          serif title, a hairline rule, and an optional plate index. */}
      <header className={eyebrow ? "mb-3" : "mb-3 flex items-baseline justify-between gap-3"}>
        {eyebrow ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <span className="fg-eyebrow">{eyebrow}</span>
                <h2
                  className="mt-1 font-serif text-xl font-semibold tracking-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {title}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {href && (
                  <Link
                    href={href}
                    aria-label={`${cta}: ${title}`}
                    className="tap-44-y inline-flex items-center gap-1 text-xs font-medium tracking-tight"
                    style={{ color: "var(--app-brand-press)" }}
                  >
                    {cta} <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </Link>
                )}
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <div className="fg-rule flex-1" />
              {plateNo && <span className="fg-plate-no shrink-0">{plateNo}</span>}
            </div>
          </>
        ) : (
          <>
            <h2 className="font-serif text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              {title}
            </h2>
            <div className="flex shrink-0 items-center gap-3">
              {href && (
                <Link
                  href={href}
                  aria-label={`${cta}: ${title}`}
                  className="tap-44-y inline-flex items-center gap-1 text-xs font-medium tracking-tight"
                  style={{ color: "var(--app-brand-press)" }}
                >
                  {cta} <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </Link>
              )}
            </div>
          </>
        )}
      </header>
      {meta && (
        <p className="-mt-2 mb-3 text-xs" style={{ color: "var(--app-ink-3)" }}>
          {meta}
        </p>
      )}
      {children}
    </section>
  );
}
