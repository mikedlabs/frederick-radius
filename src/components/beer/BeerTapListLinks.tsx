import { ArrowUpRight } from "lucide-react";
import { BREWERY_BY_SLUG } from "@/data/beers";
import { BREWERY_EXPERIENCES, BREWERY_SOURCE_CHECKED_AT } from "@/data/brewery-experiences";

/** Direct doors to brewery-controlled beer menus. Radius does not relabel a
 * static catalog as "pouring now"; these are the sources closest to the taps. */
export default function BeerTapListLinks() {
  const links = BREWERY_EXPERIENCES.filter((item) => item.tapListUrl);
  if (links.length === 0) return null;
  return (
    <section aria-labelledby="beer-tap-list-links" className="border-y py-4" style={{ borderColor: "var(--app-border-strong)" }}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--app-ink-3)" }}>Closest to the tap</p>
          <h2 id="beer-tap-list-links" className="mt-1 text-[16px] font-semibold" style={{ color: "var(--app-ink)" }}>Official beer lists</h2>
        </div>
        <p className="font-mono text-[9px]" style={{ color: "var(--app-ink-3)" }}>Links checked {BREWERY_SOURCE_CHECKED_AT}</p>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {links.map((item) => {
          const brewery = BREWERY_BY_SLUG[item.slug];
          if (!brewery || !item.tapListUrl) return null;
          return (
            <a key={item.slug} href={item.tapListUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
              {brewery.name}<ArrowUpRight className="h-3 w-3 opacity-45" aria-hidden />
            </a>
          );
        })}
      </div>
      <p className="mt-2 text-[10px]" style={{ color: "var(--app-ink-3)" }}>Only breweries with a confirmed public beer-menu link appear here. Availability can still change during service.</p>
    </section>
  );
}
