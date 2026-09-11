import TodaySectionHeading from "@/components/today/TodaySectionHeading";

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
        ? "relative pt-1"
        : `relative rounded-[var(--app-radius-lg)] border p-4${eyebrow || plateNo ? " fg-plate" : ""}`}
      style={flat
        ? undefined
        : {
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated)",
            boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-1)",
          }}
    >
      <TodaySectionHeading
        title={title}
        meta={meta}
        eyebrow={eyebrow}
        plateNo={plateNo}
        href={href}
        cta={cta}
      />
      {children}
    </section>
  );
}
