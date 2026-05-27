import Link from "next/link";
import Image from "next/image";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { getWorthALookToday, easternDayKey } from "@/lib/worth-a-look";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/**
 * WorthALook — the photo-led discovery rail on /now.
 *
 * Six tiles, edge-to-edge horizontal scroll, each a real Frederick
 * place chosen for the day. The lineup rotates daily so a returning
 * visitor sees something new. The only place on /now where the page
 * pushes a "you might like this" surprise.
 *
 * Visual register: bigger than a row card, smaller than a feature
 * hero. Each tile is photo-led with the name overlaid in a gradient
 * bottom — the iOS Photos / Apple News + treatment. Reads as
 * editorial picks, not algorithmic ranking.
 *
 * Header copy ("Worth a look today") deliberately reuses the
 * "you might like" wording the brand voice already established
 * across /saved + /now — same trust signal, applied to discovery.
 */
export default async function WorthALook() {
  const picks = await getWorthALookToday(easternDayKey());
  if (picks.length === 0) return null;

  return (
    <section aria-label="Worth a look today" className="space-y-2.5">
      <header className="flex items-baseline justify-between px-1">
        <h2
          className="font-serif text-[20px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Worth a look today
        </h2>
        <span
          className="text-[10.5px] font-medium uppercase tracking-[0.1em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {picks.length} picks
        </span>
      </header>

      {/* Horizontal scroll rail. -mx-4 + px-4 lets the first/last
          tiles edge-fade off the screen the way the iOS App Store
          and Apple News + rails do. Snap-stop on each tile so a
          flick lands cleanly. Scrollbar hidden. */}
      <div
        className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="list"
      >
        <ol className="flex snap-x snap-mandatory gap-3" style={{ scrollPadding: "0 16px" }}>
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
                  className="tactile tactile-interactive group relative block h-[220px] w-[260px] overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-sunken)]"
                  aria-label={`${p.name} — ${cat?.name ?? p.category}`}
                >
                  {p.google_photo_url && (
                    <Image
                      src={p.google_photo_url}
                      alt={p.name}
                      fill
                      sizes="260px"
                      placeholder="blur"
                      blurDataURL={PAPER_CREAM_BLUR}
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                      unoptimized
                    />
                  )}
                  {/* Bottom gradient so the name reads on top of any
                      photo. Apple Photos pattern. */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%]"
                    style={{
                      background:
                        "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.78) 100%)",
                    }}
                  />
                  {/* Category color band — thin top edge so the eye
                      can sort the rail by type without reading. */}
                  <div
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-1"
                    style={{ background: catColor }}
                  />
                  {/* Name + category chip. Lives at the bottom on
                      the gradient. */}
                  <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                    <p
                      className="font-serif text-[17px] font-semibold leading-tight"
                      style={{ textWrap: "balance" } as React.CSSProperties}
                    >
                      {p.name}
                    </p>
                    <p
                      className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] opacity-80"
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
    </section>
  );
}
