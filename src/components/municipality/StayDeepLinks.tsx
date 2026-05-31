import { BedDouble, ExternalLink } from "lucide-react";

/**
 * StayDeepLinks — a small "Where to stay" card with pre-filtered
 * search deep links to the three major short-term-rental platforms
 * + Booking.com for hotels.
 *
 * Why deep links instead of an integration?
 *   - Airbnb / VRBO / Booking all have searchable URL patterns that
 *     accept town + state and produce a real result list. No API key,
 *     no contract, no expiring tokens.
 *   - Until we have a Frederick-specific curated rental list of our
 *     own AND a partner program in place, sending visitors to the
 *     platforms is the most useful thing we can do.
 *
 * What this is NOT:
 *   - Not an affiliate link (yet). When we get accepted to Airbnb
 *     Travel Partners or VRBO/Expedia Affiliate Network, the URLs
 *     here become the place to add the campaign id. Until then,
 *     vanilla search URLs — no tracking pixels, no monetization.
 *   - Not a recommendation. We're not vouching for any specific
 *     rental on those platforms — that's the platforms' job. We
 *     just lower the friction of finding one in {town}.
 *
 * Mounted on /m/[municipality] as a footer card so visitors who
 * scrolled the whole town page get a "by the way, where do I sleep?"
 * answer in one tap. Doesn't appear elsewhere — residents browsing
 * their own town don't need this.
 */
export default function StayDeepLinks({
  townName,
  townSlug,
}: {
  townName: string;
  townSlug: string;
}) {
  // URL builders. Each platform has a slightly different shape:
  //   - Airbnb: free-text town search via path slug
  //   - VRBO:   "vacation-rentals/usa/maryland/<county-or-town>" path
  //   - Booking: query string ?ss=<text>
  const airbnbUrl = `https://www.airbnb.com/s/${encodeURIComponent(
    `${townName}--Maryland--United-States`,
  )}/homes`;
  // VRBO supports both town-level and county-level destination URLs;
  // smaller towns don't always have their own page, so we fall back
  // to the broader Frederick County rental search.
  const vrboTownPath = townSlug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const vrboUrl = vrboTownPath === "frederick"
    ? "https://www.vrbo.com/vacation-rentals/usa/maryland/capital/frederick"
    : `https://www.vrbo.com/vacation-rentals/usa/maryland/frederick-county`;
  const bookingUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(
    `${townName}, Maryland`,
  )}`;

  const links: Array<{ label: string; href: string; sub: string }> = [
    {
      label: "Airbnb",
      href: airbnbUrl,
      sub: "Short-term rentals · search opens to results",
    },
    {
      label: "VRBO",
      href: vrboUrl,
      sub: vrboTownPath === "frederick" ? "Frederick rentals page" : "Frederick County rentals",
    },
    {
      label: "Booking.com",
      href: bookingUrl,
      sub: "Hotels + B&Bs · pre-filtered to the area",
    },
  ];

  return (
    <section
      aria-labelledby="stay-deeplinks-heading"
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-5"
      style={{ borderColor: "var(--app-border)" }}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--app-cool) 14%, transparent)",
            color: "var(--app-cool)",
          }}
        >
          <BedDouble className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[10.5px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Where to stay
          </p>
          <h2
            id="stay-deeplinks-heading"
            className="font-serif text-[18px] font-semibold leading-snug tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Find a place in {townName}.
          </h2>
          <p
            className="mt-1 text-[12.5px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            Tap a platform — search opens pre-filtered to {townName}, Maryland.
            We don&apos;t take a cut (yet); these are clean search links.
          </p>
        </div>
      </header>

      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="tactile tactile-interactive flex h-full flex-col gap-1 rounded-[var(--app-radius-md)] border p-3 transition active:scale-[0.98]"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-bg-sunken)",
              }}
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  className="font-semibold text-[13px]"
                  style={{ color: "var(--app-ink)" }}
                >
                  {l.label}
                </span>
                <ExternalLink
                  className="h-3 w-3 shrink-0"
                  strokeWidth={2.25}
                  aria-hidden
                  style={{ color: "var(--app-ink-3)" }}
                />
              </span>
              <span
                className="text-[11px] leading-snug"
                style={{ color: "var(--app-ink-3)" }}
              >
                {l.sub}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <p
        className="mt-3 text-[10.5px]"
        style={{ color: "var(--app-ink-3)" }}
      >
        A hand-picked &ldquo;Where to stay in {townName}&rdquo; list is in
        the works — local B&amp;Bs, downtown rentals, the spots that don&apos;t
        always surface on the big platforms.
      </p>
    </section>
  );
}
