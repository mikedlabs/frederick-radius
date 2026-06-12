import Link from "next/link";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * The three cards, and only three. Consolidating 35 production card designs
 * to a hero, a standard, and a compact row (Phase 1, REDUCTION.md). Each
 * carries a fixed anatomy so a user learns the shape once.
 *
 *   Plate     the lead. One 3:2 image, the place name as a headline, one
 *             verdict line. Used once per screen.
 *   Entry     the standard. A 1:1 image or a type-only card (imagery
 *             standard Tier 3), the name, a category-and-fact line.
 *   IndexRow  the compact. A hairline-separated row: name, one fact, a
 *             right-aligned datum. The dense index under the lead.
 */

function statusLabel(p: PlaceCardData): { text: string; tone: "open" | "soon" | "shut" } {
  const s = p.open_status;
  if (s.state === "open") return { text: `OPEN TILL ${s.closesAt}`, tone: "open" };
  if (s.state === "closing-soon") return { text: `CLOSING ${s.closesAt}`, tone: "soon" };
  if (s.state === "closed") return { text: "CLOSED", tone: "shut" };
  return { text: "HOURS UNLISTED", tone: "shut" };
}

/** The one editorial verdict line. Prefers a curated reason, then the
 *  blurb's first clause, so the lead always states a point of view. */
function verdict(p: PlaceCardData): string {
  if (p.hidden_gem) return "A local secret worth the detour.";
  if (p.local_favorite) return "The one locals send you to.";
  const blurb = (p.short_blurb ?? "").split(/(?<=[.!?])\s/)[0];
  return blurb || "Worth your time today.";
}

export function Plate({ p, href }: { p: PlaceCardData; href: string }) {
  const st = statusLabel(p);
  return (
    <Link href={href} className="block px-[var(--a-gutter)]">
      {p.google_photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.google_photo_url}
          alt=""
          loading="eager"
          className="lab-a-image lab-a-fade aspect-[3/2] w-full rounded-[3px] object-cover"
        />
      )}
      <p
        className="lab-a-mono pt-3 uppercase tracking-[0.16em]"
        style={{
          fontSize: "var(--a-size-data)",
          color: st.tone === "open" ? "var(--a-ink)" : "var(--a-ink-3)",
        }}
      >
        {p.category} &nbsp;·&nbsp; {st.text}
      </p>
      <h2
        className="lab-a-display pt-1"
        style={{ fontSize: "var(--a-size-title)" }}
      >
        {p.name}
      </h2>
      <p
        className="pt-2"
        style={{
          fontSize: "var(--a-size-body)",
          color: "var(--a-ink-2)",
          lineHeight: 1.45,
        }}
      >
        {verdict(p)}
      </p>
    </Link>
  );
}

export function Entry({ p, href }: { p: PlaceCardData; href: string }) {
  const st = statusLabel(p);
  return (
    <Link href={href} className="flex gap-3.5 px-[var(--a-gutter)]">
      {p.google_photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.google_photo_url}
          alt=""
          loading="lazy"
          className="lab-a-image lab-a-fade h-[68px] w-[68px] shrink-0 rounded-[3px] object-cover"
        />
      ) : (
        // Tier 3: no usable image renders as a type plate, never a gray box.
        <div
          className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-[3px]"
          style={{ background: "var(--a-paper-sunk)", boxShadow: "inset 0 0 0 1px var(--a-rule)" }}
        >
          <span className="lab-a-display" style={{ fontSize: "var(--a-size-lead)", color: "var(--a-ink-3)" }}>
            {p.name.slice(0, 1)}
          </span>
        </div>
      )}
      <div className="min-w-0 flex-1 self-center">
        <h3 className="lab-a-display truncate" style={{ fontSize: "var(--a-size-lead)" }}>
          {p.name}
        </h3>
        <p
          className="lab-a-mono pt-0.5 uppercase tracking-[0.12em]"
          style={{ fontSize: "var(--a-size-data)", color: "var(--a-ink-2)" }}
        >
          {p.category} &nbsp;·&nbsp; {st.text}
        </p>
      </div>
    </Link>
  );
}

export function IndexRow({ p, href, datum }: { p: PlaceCardData; href: string; datum?: string }) {
  const st = statusLabel(p);
  return (
    <Link
      href={href}
      className="flex items-baseline gap-3 px-[var(--a-gutter)] py-3"
    >
      <span
        className="min-w-0 flex-1 truncate"
        style={{ fontSize: "var(--a-size-body)", color: "var(--a-ink)" }}
      >
        {p.name}
      </span>
      <span
        className="lab-a-mono shrink-0 uppercase tracking-[0.1em]"
        style={{ fontSize: "var(--a-size-data)", color: st.tone === "open" ? "var(--a-ink-2)" : "var(--a-ink-3)" }}
      >
        {datum ?? st.text}
      </span>
    </Link>
  );
}
