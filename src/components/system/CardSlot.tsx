import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/**
 * CardSlot — the ONE curated photographic card a result list may pin to
 * its top (redesign brief: "a single curated card slot … holding one
 * photographic card maximum; this is where 'Worth your time' curation
 * lives, clearly labeled as editorial"). Cards are demoted to this slot;
 * everything else is a ResultRow. Photography lives here, in detail
 * heroes, and Guide covers — nowhere else in a list.
 *
 * `photo` is a fill-positioned node (e.g. <SeasonalPhoto/> or next/image).
 * When absent, a typographic tile in the category color renders — a broken
 * image icon must never reach production.
 */
export default function CardSlot({
  eyebrow = "Worth your time",
  title,
  hook,
  href,
  photo,
  accent = "var(--app-brand)",
}: {
  eyebrow?: string;
  title: string;
  hook?: string;
  href?: string;
  photo?: React.ReactNode;
  /** Category color, used for the typographic fallback tile. */
  accent?: string;
}) {
  const body = (
    <div
      className="relative flex aspect-[16/10] w-full flex-col justify-end overflow-hidden rounded-[var(--app-radius-lg)] p-4"
      style={{ boxShadow: "var(--app-edge), var(--app-elev-3)" }}
    >
      {photo ? (
        <div aria-hidden className="absolute inset-0">
          {photo}
        </div>
      ) : (
        // Typographic fallback tile in the category color — never a broken
        // image glyph. The contour bands echo the field-guide plate.
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `radial-gradient(120% 100% at 0% 0%, color-mix(in srgb, ${accent} 30%, var(--app-bg-sunken)) 0%, var(--app-bg-sunken) 70%)`,
          }}
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.58) 100%)",
        }}
      />
      <div className="relative">
        <p className="t-meta t-semibold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.85)" }}>
          {eyebrow}
        </p>
        <div className="mt-0.5 flex items-end justify-between gap-3">
          <h3 className="t-title" style={{ color: "#fff" }}>
            {title}
          </h3>
          {href && (
            <ArrowUpRight
              className="mb-1 h-5 w-5 shrink-0"
              strokeWidth={2.5}
              aria-hidden
              style={{ color: "#fff" }}
            />
          )}
        </div>
        {hook && (
          <p className="t-body mt-1 max-w-[42ch]" style={{ color: "rgba(255,255,255,0.9)" }}>
            {hook}
          </p>
        )}
      </div>
    </div>
  );

  if (!href) return body;
  return (
    <Link href={href} className="block">
      {body}
    </Link>
  );
}
