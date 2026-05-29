import Link from "next/link";
import Image from "next/image";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { getWorthALookToday, easternDayKey } from "@/lib/worth-a-look";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import CollapsibleSection from "@/components/ui/CollapsibleSection";

/**
 * WorthALook — compact photo-led discovery rail on /now.
 *
 * Six tiles, edge-to-edge horizontal scroll, each a real Frederick
 * place chosen for the day. The lineup rotates daily so a returning
 * visitor sees something new.
 *
 * v2 sized: cards shrank from 260×220 to 152×190 to match the
 * MoodTiles register — the page was reading top-heavy with the old
 * size dominating the scroll vs the tight 6-up tile row above. The
 * smaller card still reads as photo-led but stops competing with the
 * action surfaces.
 *
 * Header gets the same eyebrow treatment as MoodTiles ("What do you
 * need right now") instead of the bigger serif headline — keeps the
 * two surfaces visually paired.
 */
export default async function WorthALook() {
  const picks = await getWorthALookToday(easternDayKey());
  if (picks.length === 0) return null;

  return (
    // Collapsible: the discovery rail can be tucked away by readers who
    // want a tighter page; the title + "N picks" stay as the summary
    // row. Defaults open so the daily surprise still greets visitors.
    <CollapsibleSection
      title="Worth a look today"
      count={picks.length}
      countLabel="picks"
      storageKey="fr:worth-a-look-open:v1"
      defaultOpen
    >
      {/* Horizontal scroll rail. -mx-4 + px-4 lets the first/last
          tiles edge-fade off the screen. Snap-stop on each tile so
          a flick lands cleanly. */}
      <div
        className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="list"
      >
        <ol className="flex snap-x snap-mandatory gap-2.5" style={{ scrollPadding: "0 16px" }}>
          {picks.map((p) => {
            const cat = CATEGORY_BY_SLUG[p.category];
            const catColor = cat?.color ?? "var(--app-brand)";
            return (
              <li
                key={p.slug}
                role="listitem"
                className="snap-start"
              >
                <Link
                  href={`/places/${p.slug}`}
                  className="tactile tactile-interactive group relative block h-[190px] w-[152px] overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)]"
                  aria-label={`${p.name} — ${cat?.name ?? p.category}`}
                >
                  {p.google_photo_url && (
                    <Image
                      src={p.google_photo_url}
                      alt={p.name}
                      fill
                      sizes="152px"
                      placeholder="blur"
                      blurDataURL={PAPER_CREAM_BLUR}
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                      // View Transitions pair-up: same name on the
                      // hero of /places/[slug] morphs this tile photo
                      // into the detail hero on route change.
                      style={{ viewTransitionName: `place-photo-${p.slug}` }}
                    />
                  )}
                  {/* Bottom gradient so the name reads on any photo. */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%]"
                    style={{
                      background:
                        "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.82) 100%)",
                    }}
                  />
                  {/* Category color band — thin top edge so the eye
                      can sort the rail by type without reading. */}
                  <div
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-1"
                    style={{ background: catColor }}
                  />
                  {/* Name + category chip — compressed text sizes
                      to match the smaller card. */}
                  <div className="absolute inset-x-0 bottom-0 p-2.5 text-white">
                    <p
                      className="font-serif text-[13px] font-semibold leading-tight"
                      style={{ textWrap: "balance" } as React.CSSProperties}
                    >
                      {p.name}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[10.5px] font-medium uppercase tracking-[0.08em] opacity-80"
                    >
                      {cat?.name ?? p.category}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </CollapsibleSection>
  );
}
