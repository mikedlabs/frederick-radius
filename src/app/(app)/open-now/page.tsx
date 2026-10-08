import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  getOpenNowSnapshot,
  likelyOpenPlaces,
  openNowProofModule,
  type PlaceCardData,
} from "@/lib/loaders/places";
import { formatTime } from "@/lib/hours";
import { isRecommendable } from "@/lib/relevance";
import { MUNICIPALITY_BY_SLUG, MUNICIPALITIES } from "@/data/municipalities";
import ScopeBar from "@/components/nav/ScopeBar";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { LngLat } from "@/lib/geo";
import { resolveServerTownRankingContext } from "@/lib/scope";
import { happyHourOnAt, hasFieldNotes } from "@/lib/loaders/fieldNotes";
import {
  LIKELY_OPEN_CHECK_HOURS,
  OPEN_NOW_TITLE,
  openNowSummary,
} from "@/lib/trust-language";
import PlaceIndex, {
  type IndexPinMap,
  type IndexRow,
  type IndexSection,
} from "@/components/place/PlaceIndex";
import PageBloom from "@/components/ui/PageBloom";
import FreshnessGuard from "@/components/today/FreshnessGuard";

/**
 * /open-now — the fast list answer to the app's most urgent question.
 *
 * June-9 review §4: "What's open right now?" routed to /map?open=now —
 * a ~2MB Mapbox surface — making the heaviest page in the app the front
 * door for the most time-critical need. The review's rule: question →
 * list answer first → optional map. This page is that list: server-
 * rendered, no Mapbox, ranked from the user's home town (fr_home_muni
 * cookie, downtown fallback) exactly like category pages (C2). The list
 * leads with a still, numbered pin map of its first rows (ResultsPinMap, the
 * self-hosted basemap Ask uses), which loads only near the viewport.
 *
 * Honesty rules:
 *   - The headline count is derived from THE SAME list rendered below,
 *     so the number can never contradict the content (review §7 caught
 *     "146 open" next to "Open now 0" — numbers from different sources).
 *   - Verified-open (Google hours say open) leads; "likely open" places
 *     (curated reliable windows, hours unverified) are labeled as such.
 *   - FreshnessGuard: a cached shell never presents an old evening as
 *     "right now."
 */

export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: "/open-now" },
  title: OPEN_NOW_TITLE,
  description:
    "What's open right now across Frederick County, based on verified posted hours and ranked from your town.",
  openGraph: { title: OPEN_NOW_TITLE, description:
    "What's open right now across Frederick County, based on verified posted hours and ranked from your town." },
};

export default async function OpenNowPage() {
  const store = await cookies();
  // Rank from the browsing SCOPE first (UX-02), then the long-term home town.
  // A selected town is also a hard boundary. Whole county has no artificial
  // downtown origin, so it uses the same quality-first county order as the
  // category pages even when a home town is saved.
  const rankingContext = resolveServerTownRankingContext(
    store.get("fr_scope")?.value ?? null,
    store.get("fr_home_muni")?.value ?? null,
  );
  const homeMuni = rankingContext.originMunicipality;
  const homeCentroid: LngLat | null = homeMuni
    ? (MUNICIPALITY_BY_SLUG[homeMuni]?.centroid ?? null)
    : null;
  const origin = homeCentroid ?? undefined;
  const now = new Date();
  const openNowRanking = {
    municipality: rankingContext.filterMunicipality ?? undefined,
    originSource: rankingContext.source,
  };

  // Destinations (food/arts/outdoors/shops) sort above personal-service
  // and civic categories — same rule as the town "worth your time" rail
  // (#500): a counseling office being open is true but it's never the
  // answer to "what's open right now?". Stable sort keeps the quality+
  // proximity order within each group.
  // The shared isOpenNow predicate (open OR closing-soon), so this
  // page's headline and /today's briefing read the same number from
  // the same rule. A place closing in 40 minutes IS open right now;
  // its card already says "closing soon" (2026-06 audit, offender 2).
  const snapshot = getOpenNowSnapshot(now, origin, 0, openNowRanking);
  const verified = snapshot.places;
  const verifiedSlugs = new Set(verified.map((p) => p.slug));
  const likely = likelyOpenPlaces(origin, now, openNowRanking).filter(
    (p) =>
      isRecommendable(p) &&
      openNowProofModule(p) !== null &&
      !verifiedSlugs.has(p.slug),
  );

  const asOf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(snapshot.asOf));
  const dateline = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  })
    .format(now)
    .toUpperCase();

  // ── Index rows (the judged card system: serif name, one support line,
  //    one mono data line). Every field here earns its slot by decision
  //    value; what a cell can't say honestly, it doesn't say.
  // Photo URLs ride inline for the first screenful only. Each Google photo
  // token is ~700B of incompressible base64; the 800 this page used to
  // serialize were 88% of its compressed document (322KB -> ~35KB measured
  // 2026-08-19) while roughly 30 ever painted. Rows past the fold hydrate on
  // scroll through PlaceIndex's lazyPhotos path, which answers via the full
  // server loader so the photo-suppression verdicts keep applying. The first
  // rows keep inline URLs so the above-the-fold anchors paint with the page
  // (and prioritizeFirstPhoto keeps its subject).
  const inlinePhotoSlugs = new Set(
    verified
      .filter((p) => p.google_photo_url)
      .slice(0, 6)
      .map((p) => p.slug),
  );
  const toRow = (p: PlaceCardData, withStatus: boolean): IndexRow => {
    const cat = CATEGORY_BY_SLUG[p.category];
    // Support line takes CURATED intel only (known_for); scraped blurbs leak
    // first-person marketing copy ("We are a new family owned…") and schedule
    // fragments. A hook that restates the place name or runs long says
    // nothing at cell size — category alone is honest support.
    const rawHook = p.known_for?.[0] ?? "";
    const hook =
      rawHook &&
      rawHook.length <= 52 &&
      !rawHook.toLowerCase().startsWith(p.name.toLowerCase().slice(0, 10))
        ? rawHook
        : "";
    const s = p.open_status;
    let status: IndexRow["status"] = null;
    let closesMin: number | null = null;
    if (withStatus && (s.state === "open" || s.state === "closing-soon")) {
      const closes = s.closesAt;
      const [hh, mm] = closes.split(":").map(Number);
      closesMin = Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
      // A close in the small hours (midnight, 1am, 2am) is TOMORROW's clock:
      // without the day rollover, "Until 12am" sorts as the soonest close on
      // the closing-soonest sort when it is in fact the latest.
      if (closesMin != null && closesMin < 300) closesMin += 1440;
      if (s.state === "open" && s.allDay) {
        status = { kind: "open", label: "Open 24 hours" };
        closesMin = 2879;
      } else if (s.state === "closing-soon" || (s.state === "open" && s.closingSoon)) {
        status = { kind: "soon", label: `Closes ${formatTime(closes)}` };
      } else {
        status = { kind: "open", label: `Until ${formatTime(closes)}` };
      }
    }
    // A time-bound mark speaks only when a structured window covers this
    // minute: "HAPPY HOUR" at 10 AM for a 4-7 PM pour was a false "now"
    // claim. Happy hours carry windows parsed at the Field Notes boundary;
    // deals carry no structured window, so they never earn a "deal" mark
    // here. Free text is never parsed at render time. A place with notes
    // still shows the timeless "field notes" mark.
    const mark = happyHourOnAt(p.slug, now)
      ? "happy hour"
      : hasFieldNotes(p.slug)
        ? "field notes"
        : null;
    return {
      slug: p.slug,
      name: p.name,
      meta: `${cat?.name ?? p.category}${hook ? ` · ${hook}` : ""}`,
      photo: inlinePhotoSlugs.has(p.slug) ? p.google_photo_url ?? null : null,
      category: p.category,
      accent: cat?.color ?? "var(--app-ink-2)",
      status,
      closesMin,
      rating:
        p.google_rating != null && (p.google_rating_count ?? 0) >= 20 ? p.google_rating : null,
      ratingCount:
        p.google_rating != null && (p.google_rating_count ?? 0) >= 20 ? p.google_rating_count : null,
      mark,
      // No printed distance on /open-now: ranking uses the town centroid,
      // and a centroid-to-place figure would read as YOUR distance.
      distance: null,
    };
  };

  // Three honest sections: what you'd cross town for, split eat-and-drink
  // first (the most common "open now" intent), everything everyday last.
  const eat: IndexRow[] = [];
  const todo: IndexRow[] = [];
  const shop: IndexRow[] = [];
  const everyday: IndexRow[] = [];
  for (const p of verified) {
    const row = toRow(p, true);
    const proofModule = openNowProofModule(p);
    if (proofModule === "eat-drink") eat.push(row);
    else if (proofModule === "things-to-do") todo.push(row);
    else if (proofModule === "shop-local") shop.push(row);
    else everyday.push(row);
  }
  const sections: IndexSection[] = [
    { key: "eat", label: "Eat & drink", rows: eat },
    { key: "todo", label: "Things to do", rows: todo },
    { key: "shop", label: "Shops & markets", rows: shop },
    { key: "everyday", label: "Everyday & services", rows: everyday },
  ];
  const likelySections: IndexSection[] = [
    {
      key: "likely",
      label: LIKELY_OPEN_CHECK_HOURS,
      rows: likely.slice(0, 12).map((p) => toRow(p, false)),
    },
  ];

  // Show before tell: the first non-empty section leads with the numbered
  // pin map Ask uses. Only that section's rows carry their catalog point,
  // rounded to about a meter, because any of them can reach the first
  // screenful under a client re-sort and the rest of the page never needs
  // one. Pins are Brick for every row and never encode open state.
  const pointBySlug = new Map(
    [...verified, ...likely].map((p) => [p.slug, p.geom] as const),
  );
  const roundPoint = (value: number) => Math.round(value * 1e5) / 1e5;
  const withPoints = (section: IndexSection): IndexSection => ({
    ...section,
    rows: section.rows.map((row) => {
      const point = pointBySlug.get(row.slug);
      return point && Number.isFinite(point.lng) && Number.isFinite(point.lat)
        ? { ...row, lng: roundPoint(point.lng), lat: roundPoint(point.lat) }
        : row;
    }),
  });
  const firstVerifiedKey = sections.find((s) => s.rows.length > 0)?.key;
  const pinnedKey = firstVerifiedKey ?? (likely.length > 0 ? "likely" : null);
  const verifiedSections = sections.map((s) => (s.key === pinnedKey ? withPoints(s) : s));
  const likelyIndexSections = likelySections.map((s) =>
    s.key === pinnedKey ? withPoints(s) : s,
  );
  const fullMapHref = "/map?mode=browse&open=now";
  // The map's accessible name claims no more than the pinned list does. The
  // likely list is an estimate from usual hours that the header says to
  // check, so its pins are never read aloud as places open now.
  const pinMapName =
    pinnedKey === "likely"
      ? "places likely open at this hour"
      : "places whose recently checked hours say they are open";
  const pinMap: IndexPinMap | undefined = pinnedKey
    ? {
        sectionKey: pinnedKey,
        name: pinMapName,
        fullMap: { href: fullMapHref, label: "Open the full map" },
      }
    : undefined;

  return (
    <div className="relative space-y-6">
      <PageBloom variant="single" />
      <FreshnessGuard renderedAtIso={now.toISOString()} />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/today"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Back to Today
        </Link>
      </nav>

      {/* Masthead — the almanac dateline over the serif headline; the count
          rides the mono support line, never the h1. */}
      <header>
        <div aria-hidden className="fg-rule mb-2" />
        <p
          className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Frederick County · {dateline} · {asOf}
        </p>
        <h1
          className="mt-1 font-serif text-[30px] font-semibold leading-[1.05] tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {OPEN_NOW_TITLE}
        </h1>
        {/* The page's one statement of uncertainty. Posted hours are evidence,
            not a promise (the old line called every row confirmed), so the
            basis and the caveat are said here once instead of per section. */}
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          {openNowSummary(snapshot.count, likely.length)}
        </p>
      </header>

      {/* Where the list ranks from — always shown, always changeable, writes
          the shared scope (beta feedback 2026-07-12: no way to change location
          once set). Carries the "ranked from X" that used to ride the count
          line, now interactive. */}
      <ScopeBar
        current={homeMuni}
        selectedTown={rankingContext.filterMunicipality}
        municipalities={MUNICIPALITIES.map((m) => ({ slug: m.slug, name: m.name }))}
      />

      {/* The numbered pin map leads whichever list renders first, and its
          quiet "Open the full map" link under it is the ONE door into the
          heavy map surface. With nothing listed, that link stands alone. */}
      {verified.length > 0 ? (
        <PlaceIndex
          sections={verifiedSections}
          prioritizeFirstPhoto
          lazyPhotos
          pinMap={pinnedKey === firstVerifiedKey ? pinMap : undefined}
        />
      ) : likely.length === 0 ? (
        // Nothing to list at all: point at the map link that follows. When
        // the likely list does render, the header already says what it is
        // and to check before going, so no second caveat appears here.
        <div className="space-y-1">
          <p className="text-body" style={{ color: "var(--app-ink-2)" }}>
            Open the map to look for places nearby, or check back a little later.
          </p>
          <Link
            href={fullMapHref}
            className="text-meta-lg inline-flex min-h-11 items-center gap-1 font-semibold hover:underline"
            style={{ color: "var(--app-brand-press)" }}
          >
            Open the full map
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}

      {likely.length > 0 && (
        <PlaceIndex
          sections={likelyIndexSections}
          showSort={false}
          lazyPhotos
          pinMap={pinnedKey === "likely" ? pinMap : undefined}
        />
      )}
    </div>
  );
}
