import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowLeft, MapIcon, ArrowRight } from "lucide-react";
import { rankPlaces, likelyOpenPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { isOpenNow, formatTime } from "@/lib/hours";
import { isRecommendable, isDestinationCategory } from "@/lib/relevance";
import { MUNICIPALITY_BY_SLUG, MUNICIPALITIES } from "@/data/municipalities";
import ScopeBar from "@/components/nav/ScopeBar";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { FREDERICK_CENTER, type LngLat } from "@/lib/geo";
import { effectiveOriginSlug } from "@/lib/scope";
import { fieldNotesFor } from "@/lib/loaders/fieldNotes";
import PlaceIndex, { type IndexRow, type IndexSection } from "@/components/place/PlaceIndex";
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
 * cookie, downtown fallback) exactly like category pages (C2).
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
  title: "Open now",
  description:
    "What's open right now across Frederick County, based on verified posted hours and ranked from your town.",
  openGraph: { title: "Open now", description:
    "What's open right now across Frederick County, based on verified posted hours and ranked from your town." },
};

export default async function OpenNowPage() {
  const store = await cookies();
  // Rank from the browsing SCOPE first (UX-02), the long-term home town
  // second, downtown last. A "Whole county" scope resolves to no town, so
  // the list ranks county-wide from center — even when a home town is set.
  const homeMuni = effectiveOriginSlug(
    store.get("fr_scope")?.value ?? null,
    store.get("fr_home_muni")?.value ?? null,
  );
  const homeCentroid: LngLat | null = homeMuni
    ? (MUNICIPALITY_BY_SLUG[homeMuni]?.centroid ?? null)
    : null;
  const origin = homeCentroid ?? FREDERICK_CENTER;
  const now = new Date();

  // Destinations (food/arts/outdoors/shops) sort above personal-service
  // and civic categories — same rule as the town "worth your time" rail
  // (#500): a counseling office being open is true but it's never the
  // answer to "what's open right now?". Stable sort keeps the quality+
  // proximity order within each group.
  // The shared isOpenNow predicate (open OR closing-soon), so this
  // page's headline and /today's briefing read the same number from
  // the same rule. A place closing in 40 minutes IS open right now;
  // its card already says "closing soon" (2026-06 audit, offender 2).
  const verified = rankPlaces({ origin, now, preferOpen: true, limit: 500 })
    .filter((p) => isOpenNow(p.open_status))
    .filter(isRecommendable)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const da = isDestinationCategory(a.p.category) ? 0 : 1;
      const db = isDestinationCategory(b.p.category) ? 0 : 1;
      return da - db || a.i - b.i;
    })
    .map((x) => x.p);
  const verifiedSlugs = new Set(verified.map((p) => p.slug));
  const likely = likelyOpenPlaces(origin, now).filter(
    (p) => isRecommendable(p) && !verifiedSlugs.has(p.slug),
  );

  const asOf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
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
    const fn = fieldNotesFor(p.slug);
    const mark = fn?.happy_hour
      ? "happy hour"
      : fn?.deals?.length
        ? "deal"
        : fn?.insider?.length || fn?.parking
          ? "field notes"
          : null;
    return {
      slug: p.slug,
      name: p.name,
      meta: `${cat?.name ?? p.category}${hook ? ` · ${hook}` : ""}`,
      photo: p.google_photo_url ?? null,
      category: p.category,
      accent: cat?.color ?? "var(--app-ink-2)",
      status,
      closesMin,
      rating:
        p.google_rating != null && (p.google_rating_count ?? 0) >= 20 ? p.google_rating : null,
      mark,
      // No printed distance on /open-now: ranking uses the town centroid,
      // and a centroid-to-place figure would read as YOUR distance.
      distance: null,
    };
  };

  // Three honest sections: what you'd cross town for, split eat-and-drink
  // first (the most common "open now" intent), everything everyday last.
  const EAT = new Set([
    "restaurant",
    "pizza",
    "food-truck",
    "bakery",
    "coffee",
    "ice-cream",
    "brewery",
    "winery",
    "distillery",
    "bar",
  ]);
  const eat: IndexRow[] = [];
  const todo: IndexRow[] = [];
  const everyday: IndexRow[] = [];
  for (const p of verified) {
    const row = toRow(p, true);
    if (EAT.has(p.category)) eat.push(row);
    else if (isDestinationCategory(p.category)) todo.push(row);
    else everyday.push(row);
  }
  const sections: IndexSection[] = [
    { key: "eat", label: "Eat & drink", rows: eat },
    { key: "todo", label: "Things to do", rows: todo },
    { key: "everyday", label: "Everyday & services", rows: everyday },
  ];
  const likelySections: IndexSection[] = [
    {
      key: "likely",
      label: "Likely open · check hours",
      rows: likely.slice(0, 12).map((p) => toRow(p, false)),
    },
  ];

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
          Open now
        </h1>
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          {verified.length > 0
            ? `${verified.length} ${verified.length === 1 ? "place is" : "places are"} confirmed open`
            : likely.length > 0
              ? "Posted schedules are available, but live verification is not."
              : "Live hours are unavailable right now."}
        </p>
      </header>

      {/* Where the list ranks from — always shown, always changeable, writes
          the shared scope (beta feedback 2026-07-12: no way to change location
          once set). Carries the "ranked from X" that used to ride the count
          line, now interactive. */}
      <ScopeBar
        current={homeMuni}
        municipalities={MUNICIPALITIES.map((m) => ({ slug: m.slug, name: m.name }))}
      />

      {verified.length > 0 ? (
        <PlaceIndex sections={sections} />
      ) : (
        <p className="text-[14px]" style={{ color: "var(--app-ink-2)" }}>
          {/* Only promise the "below" list when it actually renders (likely
              can be empty overnight or in a sparse scope). Otherwise point at
              the map link that follows, so the copy never references a section
              that isn't there. */}
          {likely.length > 0
            ? "These places are usually open at this hour based on their posted schedules. Check before you go."
            : "Open the map to look for places nearby, or check back a little later."}
        </p>
      )}

      {likely.length > 0 && <PlaceIndex sections={likelySections} showSort={false} />}

      {/* Optional map fallback — the review's rule: list answer first,
          map second. This is the ONE door into the heavy surface. */}
      <Link
        href="/map?mode=browse&open=now"
        className="tactile-interactive group flex min-h-[52px] items-center gap-3 border-y px-1 py-2.5"
        style={{
          borderColor: "var(--app-border)",
        }}
      >
        <MapIcon
          className="h-[18px] w-[18px] shrink-0"
          strokeWidth={2.25}
          style={{ color: "var(--app-brand)" }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 text-[14px] font-medium" style={{ color: "var(--app-ink-2)" }}>
          View open places on the map
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
          strokeWidth={2.5}
          style={{ color: "var(--app-brand)" }}
          aria-hidden
        />
      </Link>
    </div>
  );
}
