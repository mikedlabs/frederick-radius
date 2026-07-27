import { liveTapMenus } from "@/lib/integrations/untappd-business";
import Link from "next/link";
import { BREWERIES } from "@/data/beers";
// eslint-disable-next-line no-restricted-imports -- SERVER component: canonical place media is resolved before this async section reaches the client.
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { PlaceMedallion } from "@/components/place/PlaceMedallion";

/**
 * OnTapNow — live tap lists for pilot breweries that shared a UTFB
 * read-only token (the brewer flywheel's first tangible payoff: their
 * ACTUAL menu, on the county's beer page, updating itself).
 *
 * Self-hides entirely until at least one account is configured, so it
 * ships dark and lights up brewery by brewery as the pilot onboards.
 * Text only by house rule — names, styles, ABV/IBU carry the value;
 * Untappd-hosted artwork is never hotlinked. Attribution is explicit:
 * the menu is the brewery's own, via Untappd for Business.
 */
const BREWERY_NAME_BY_SLUG = new Map(BREWERIES.map((b) => [b.slug, b.name]));

const FRESHNESS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

export default async function OnTapNow() {
  const menus = await liveTapMenus().catch(() => []);
  if (menus.length === 0) return null;

  return (
    <section id="on-tap-now" aria-labelledby="on-tap-heading" className="scroll-mt-24">
      <header>
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-brand-press)" }}>
          Pouring right now
        </p>
        <h2 id="on-tap-heading" className="mt-1 font-serif text-[32px] font-semibold leading-tight tracking-[-0.035em] sm:text-[42px]" style={{ color: "var(--app-ink)" }}>
          On tap, live from the breweries.
        </h2>
        <p className="mt-2 max-w-[38rem] text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          These lists come straight from each brewery&rsquo;s own Untappd for
          Business menu and refresh through the day.
        </p>
      </header>

      <div className="mt-5 space-y-6">
        {menus.map((menu) => {
          const breweryName =
            BREWERY_NAME_BY_SLUG.get(menu.slug) ?? menu.slug;
          const breweryPlace = clientPlaceBySlug(menu.slug);

          return (
            <article key={menu.slug} aria-label={`${breweryName} tap list`}>
              <Link
                href={`/places/${menu.slug}`}
                aria-label={`Open ${breweryName} details and photo credits`}
                className="tactile-interactive flex items-start gap-3 border-b pb-2.5"
                style={{ borderColor: "var(--app-border)" }}
              >
                {breweryPlace ? (
                  <PlaceMedallion place={breweryPlace} size={44} />
                ) : null}
                <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:justify-between sm:gap-3">
                  <h3 className="truncate font-serif text-[19px] font-semibold" style={{ color: "var(--app-ink)" }}>
                    {breweryName}
                  </h3>
                  <span className="mt-0.5 block font-mono text-[9.5px] leading-snug sm:mt-0 sm:shrink-0 sm:text-right" style={{ color: "var(--app-ink-3)" }}>
                    via Untappd for Business · as of {FRESHNESS.format(new Date(menu.fetchedAt))}
                  </span>
                </div>
              </Link>
              {menu.sections.map((section) => (
                <div key={section.name} className="mt-3">
                  {menu.sections.length > 1 && (
                    <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
                      {section.name}
                    </p>
                  )}
                  <ul className="reveal-up mt-1 divide-y" style={{ borderColor: "var(--app-border)" }}>
                    {section.items.map((item) => (
                      <li key={item.name} className="flex items-baseline justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
                            {item.name}
                          </span>
                          {(item.style || item.description) && (
                            <span className="mt-0.5 block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                              {item.style}
                              {item.style && item.description ? " · " : ""}
                              {item.description}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                          {item.abv != null ? `${item.abv.toFixed(1)}%` : ""}
                          {item.abv != null && item.ibu != null ? " · " : ""}
                          {item.ibu != null ? `${Math.round(item.ibu)} IBU` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </article>
          );
        })}
      </div>
    </section>
  );
}
