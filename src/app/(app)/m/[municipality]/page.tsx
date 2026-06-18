import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Search, ArrowRight, ArrowUpRight } from "lucide-react";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { eventsInMunicipality, nearTown, BY_TOWN_ENABLED } from "@/lib/loaders/events";
import { decoratePlace, publicPlacesByMunicipality } from "@/lib/loaders/places";
import { isRecommendable, isDestinationCategory } from "@/lib/relevance";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";
import PageBloom from "@/components/ui/PageBloom";
import SeasonalPhoto from "@/components/ui/SeasonalPhoto";
import TownStrip from "@/components/municipality/TownStrip";
import TownLocatorLine from "@/components/municipality/TownLocatorLine";
import TownAlmanac from "@/components/municipality/TownAlmanac";
import AerialBeat from "@/components/place/AerialBeat";
import StayDeepLinks from "@/components/municipality/StayDeepLinks";
import LivingHere from "@/components/municipality/LivingHere";
import { municipalCivicFor } from "@/lib/loaders/municipalCivic";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

export const revalidate = 600;

/**
 * Town page — answer-first, dense, field-guide (redesign).
 *
 * The page answers "what's this town like, and what's worth going for?" —
 * NOT "list every place." Spine, top → bottom:
 *   1. Curated SeasonalPhoto hero — a quiet {type} · Frederick County tag,
 *      the town name, and ONE short blurb. No pop./est. metadata lead.
 *   2. A town-scoped ask/search pill — the first action.
 *   3. A field-guide locator line (mono caps centroid coordinates).
 *   4. Worth your time — the LEAD answer: a glow-lead selected card + a
 *      2-up grid of compact cells, then a demoted "All places →" link.
 *   5. Sibling-town nav (TownStrip) as a slim row.
 *   6. Upcoming events (honest empty-state preserved).
 *   7. Living here — civic + town links merged into ONE demoted block.
 *   8. StayDeepLinks footer.
 *
 * Sections still self-hide when empty (honest empty states). Layout/visual
 * only — the data loaders below are unchanged.
 */

export async function generateStaticParams() {
  return MUNICIPALITIES.map((m) => ({ municipality: m.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ municipality: string }> }
): Promise<Metadata> {
  const { municipality } = await params;
  const m = MUNICIPALITY_BY_SLUG[municipality];
  if (!m) return { title: "Not found" };
  return {
    title: `${m.name}, Maryland`,
    description: m.description,
    alternates: { canonical: `/m/${municipality}` },
    openGraph: {
      title: m.name,
      description: m.hero_blurb,
      images: [{ url: `/api/og?type=municipality&slug=${municipality}`, width: 1200, height: 630 }],
    },
  };
}

export default async function MunicipalityPage(
  { params }: { params: Promise<{ municipality: string }> }
) {
  const { municipality } = await params;
  const m = MUNICIPALITY_BY_SLUG[municipality];
  if (!m) notFound();

  const places = publicPlacesByMunicipality(m.slug)
    .map((p) => decoratePlace(p, m.centroid))
    .sort((a, b) => b.feature_score - a.feature_score);

  // "Worth your time" is a destination-led reel that ranks differently
  // from the raw feature_score order. Two fixes for audit T4 — the page
  // promised breweries/
  // arts but led with Crossfits, training studios, and a meeting house:
  //   1. isRecommendable drops pure institutions (a no-op today since these
  //      rows lack a Google primary_type, but it future-proofs the surface
  //      and keeps it consistent with every other recommendation surface).
  //   2. Destinations (food/arts/outdoors/shops) sort ABOVE personal-service
  //      and civic/utility categories (wellness/services/worship…). Within
  //      each group, feature_score still orders. A stable sort keeps it
  //      deterministic. Down-rank, never delete — a thin town still fills.
  // Evidence floor for a "worth your time" claim: a real rating with a
  // handful of reviews, or a human curation flag. The 2026-06 audit
  // caught a travel agency, a wig shop, and a funeral home leading this
  // module at night: all tagged shopping, none with rating evidence,
  // all sorting as "not closed" because their hours are unknown. A tier,
  // not a filter, so a thin town still fills (down-rank, never delete).
  const hasEvidence = (p: (typeof places)[number]) =>
    p.hidden_gem ||
    p.local_favorite ||
    ((p.google_rating ?? 0) >= 4.0 && (p.google_rating_count ?? 0) >= 5);
  const worthYourTime = places
    .filter(isRecommendable)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      // 1) Destinations (food/arts/outdoors/shops) over personal-service +
      //    civic/utility — so a CrossFit box or therapy office never leads a
      //    town's "worth your time" (audit §1).
      const da = isDestinationCategory(a.p.category) ? 0 : 1;
      const db = isDestinationCategory(b.p.category) ? 0 : 1;
      if (da !== db) return da - db;
      // 2) Places with rating evidence or curation outrank the phone-book
      //    tail regardless of hours, so junk can never lead on data gaps.
      const ea = hasEvidence(a.p) ? 0 : 1;
      const eb = hasEvidence(b.p) ? 0 : 1;
      if (ea !== eb) return ea - eb;
      // 3) Among those, three open tiers: verified open, unknown, closed.
      //    The old two-tier sort (closed last) let unknown-hours places
      //    rank EQUAL to open ones, which surfaced the tail at 11 PM when
      //    every real destination had closed (2026-06 audit).
      const tier = (s: (typeof a.p)["open_status"]["state"]) =>
        s === "closed" ? 2 : s === "open" || s === "closing-soon" ? 0 : 1;
      const ca = tier(a.p.open_status.state);
      const cb = tier(b.p.open_status.state);
      if (ca !== cb) return ca - cb;
      // 4) Then feature_score, with the original (proximity-aware) order as a
      //    deterministic tiebreak.
      return b.p.feature_score - a.p.feature_score || a.i - b.i;
    })
    .map((x) => x.p);

  // The lead pick gets the glow; the next handful fill a compact 2-up grid.
  const lead = worthYourTime[0];
  const grid = worthYourTime.slice(1, 7);

  const upcomingEvents = eventsInMunicipality(m.slug).slice(0, 4);
  const nearbyEvents = BY_TOWN_ENABLED ? nearTown(m.slug, new Date()) : [];
  // Buried-civic answers for this town (trash/recycling, hall, permits…),
  // null until the extraction agent populates it. The block self-hides.
  const civic = municipalCivicFor(m.slug);

  // Structured data (June-9 audit P2): the town as a schema.org Place +
  // a BreadcrumbList, so town pages join the knowledge graph like the
  // place/event details already do.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: `${m.name}, Maryland`,
    description: m.description,
    geo: { "@type": "GeoCoordinates", latitude: m.centroid.lat, longitude: m.centroid.lng },
    containedInPlace: { "@type": "AdministrativeArea", name: "Frederick County, Maryland" },
  };

  return (
    <div className="relative space-y-5">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Towns", path: "/towns" },
              { name: m.name, path: `/m/${m.slug}` },
            ]),
          ),
        }}
      />
      <PageBloom variant="single" />

      {/* 1 — Town hero. CURATED imagery only (Photo Policy, Phase 3): our
          own seasonal county photography, never a random place's Google
          photo. The overlay leads with a quiet {type} tag, the name, and
          ONE blurb — the pop./est. metadata lead is gone. */}
      <header className="relative overflow-hidden rounded-[var(--app-radius-lg)]">
        <div className="relative h-52 w-full sm:h-72">
          <SeasonalPhoto
            season="auto"
            alt={`Frederick County (near ${m.name})`}
            priority
            sizes="(max-width: 720px) 100vw, 720px"
            className="absolute inset-0"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/15" />
          <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">
              {m.type === "city" ? "City" : m.type === "town" ? "Town" : "Community"} · Frederick County
            </p>
            <h1 className="font-serif text-[34px] font-semibold leading-tight tracking-tight text-white sm:text-[40px]">
              {m.name}, Maryland
            </h1>
            <p className="font-serif text-[15px] italic leading-snug text-white/90 sm:text-[16px]">
              {m.hero_blurb}
            </p>
          </div>
        </div>
      </header>

      {/* 2 — Town-scoped ask/search pill: the first action. Ported from the
          Places pill, scoped to this town. Opens the typed search. */}
      <Link
        href="/search"
        aria-label={`Search ${m.name}`}
        className="tactile tactile-interactive group flex items-center gap-3 rounded-full py-3 pl-4 pr-2.5"
        style={{ background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-2)" }}
      >
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-brand) 14%, transparent)", color: "var(--app-brand-press)" }}
        >
          <Search className="h-[17px] w-[17px]" strokeWidth={2.25} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: "var(--app-ink-3)" }}>
          Search {m.name}…
        </span>
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition-transform group-active:scale-95"
          style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand, #fff)" }}
          aria-hidden
        >
          <ArrowRight className="h-[17px] w-[17px]" strokeWidth={2.5} />
        </span>
      </Link>

      {/* 3 — Field-guide locator line: mono caps centroid coordinates,
          echoing the Saved header's plate mark. */}
      <TownLocatorLine centroid={m.centroid} type={m.type} />

      {/* 3b — Cliff notes: the verified almanac (one-liner + FAQ + fun facts
          + local insight). The informative town context at the top of the
          page, so the reader knows what the town IS before the place reel. */}
      <TownAlmanac slug={m.slug} townName={m.name} />

      {/* 4 — Worth your time: the LEAD answer. A glow-lead selected card,
          then a compact 2-up grid of cells, then a demoted "all places"
          link. This curates rather than listing every place. */}
      {lead ? (
        <section className="space-y-3">
          <div className="flex items-baseline gap-2.5">
            <h2 className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              Worth your time
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
              in {m.name}
            </span>
          </div>

          {/* The selected pick — glow-lead. */}
          <div
            className="rounded-[var(--app-radius-lg)]"
            style={{ boxShadow: "0 16px 36px -20px color-mix(in srgb, var(--app-brand) 55%, transparent)" }}
          >
            <PlaceCard place={lead} variant="answer" />
          </div>

          {/* Compact 2-up grid of the next handful. */}
          {grid.length > 0 && (
            <ul className="grid grid-cols-2 gap-2">
              {grid.map((p) => (
                <li key={p.slug}>
                  <PlaceCard place={p} variant="grid" />
                </li>
              ))}
            </ul>
          )}

          {/* Demoted directory door — NOT the inline browse chrome. Search
              is the canonical "see everything" surface; pre-fill the town. */}
          <Link
            href={`/search?q=${encodeURIComponent(m.name)}`}
            className="inline-flex items-center gap-1 text-[13px] font-semibold"
            style={{ color: "var(--app-brand-press)" }}
          >
            All places in {m.name}
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Link>
        </section>
      ) : (
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
          We&apos;re still seeding places for {m.name}. Check back soon, or{" "}
          <Link href="/submit/place" className="font-semibold underline-offset-2 hover:underline" style={{ color: "var(--app-brand-press)" }}>
            submit a place you love
          </Link>
          .
        </p>
      )}

      {/* "{Town} from above" — the nearest geotagged drone shot. Only towns
          the aerial archive covers render this; everywhere else self-hides. */}
      <AerialBeat lat={m.centroid.lat} lng={m.centroid.lng} label={m.name} maxMeters={1500} />

      {/* 5 — Sibling-town nav as a slim row. */}
      <TownStrip activeSlug={m.slug} />

      {/* 6 — Upcoming — "what's happening." Kept tight (max 4); empty state
          surfaces the submit door + a nearby fallback. */}
      {(upcomingEvents.length > 0 || BY_TOWN_ENABLED) && (
        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              Upcoming in {m.name}
            </h2>
            <Link
              href={BY_TOWN_ENABLED ? `/events?view=town&m=${m.slug}` : "/events"}
              className="text-[13px] font-semibold"
              style={{ color: "var(--app-brand-press)" }}
            >
              All events →
            </Link>
          </div>
          {upcomingEvents.length > 0 ? (
            <ul className="space-y-2">
              {upcomingEvents.map((e) => (
                <li key={`${e.slug}-${e.starts_at}`}><EventCard event={e} /></li>
              ))}
            </ul>
          ) : (
            <div
              className="space-y-3 rounded-[var(--app-radius-lg)] border border-dashed p-4"
              style={{ borderColor: "var(--app-border)" }}
            >
              <p className="text-sm font-medium" style={{ color: "var(--app-ink-2)" }}>
                Nothing on the calendar for {m.name} yet. It runs on word of mouth.
              </p>
              <Link
                href={`/submit/event?m=${m.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white shadow-[var(--app-shadow-1)]"
                style={{ background: "var(--app-brand)" }}
              >
                Submit an event for {m.name}
              </Link>
              {nearbyEvents.length > 0 && (
                <p className="border-t pt-3 text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
                  Nearby:{" "}
                  <Link
                    href="/events"
                    className="font-semibold underline-offset-2 hover:underline"
                    style={{ color: "var(--app-ink-2)" }}
                  >
                    {nearbyEvents[0].title} and more nearby →
                  </Link>
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* 7 — Living here. CivicCard + TownLinks merged into ONE demoted
          block low on the page, with an IconStamp squircle and one heading.
          Self-hides when the town has neither civic data nor a verified site. */}
      <LivingHere slug={m.slug} townName={m.name} civic={civic} />

      {/* 8 — Footer card — the visitor's "where do I sleep?" answer. */}
      <StayDeepLinks townName={m.name} townSlug={m.slug} />
    </div>
  );
}
