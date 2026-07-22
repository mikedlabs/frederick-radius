import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PLACE_BY_SLUG } from "@/data/places";
import { EVENT_BY_SLUG } from "@/data/events";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { COLLECTION_BY_SLUG } from "@/data/collections";
import { momentBySlug } from "@/data/civic-moments";
import {
  FREDERICK_LAT,
  FREDERICK_LNG,
  daylightDelta,
  moonPhase,
  sunTimes,
} from "@/lib/almanac";
import { easternDayKey } from "@/lib/tz";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { BRAND, RIPPLE_GEOMETRY } from "@/lib/brand";

// Token → hex mapping for the OG image runtime, which has no DOM
// and so can't resolve CSS variables. Keep in sync with globals.css.
// New collection accent tokens should be added here when introduced.
const COLLECTION_ACCENT_HEX: Record<string, string> = {
  "var(--app-brand)": BRAND.colors.brick,
  "var(--app-brand-2)": BRAND.colors.forest,
  "var(--app-cool)": BRAND.colors.creek,
  "var(--app-accent)": BRAND.colors.plum,
  "var(--app-sage)": "#859076",
};

const BRAND_FONTS = Promise.all([
  readFile(join(process.cwd(), "src/app/api/og/fonts/libre-caslon-display-400.woff")),
  readFile(join(process.cwd(), "src/app/api/og/fonts/public-sans-400.woff")),
  readFile(join(process.cwd(), "src/app/api/og/fonts/public-sans-600.woff")),
  readFile(join(process.cwd(), "src/app/api/og/fonts/public-sans-700.woff")),
]);

// NOTE: deliberately the Node runtime, NOT edge. This route imports
// the full composed place/event datasets (PLACE_BY_SLUG / EVENT_BY_SLUG)
// for the title + kicker; on the edge runtime the whole dataset is
// bundled into the function and exceeds Vercel's 1 MB edge limit
// ("Edge Function api/og size is 1.09 MB"). Node serverless functions
// have a far larger limit and next/og's ImageResponse runs there too,
// so this fixes the deploy error with zero loss of functionality.
export const runtime = "nodejs";

export async function GET(request: Request) {
  const [caslon400, public400, public600, public700] = await BRAND_FONTS;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "site";
  const slug = url.searchParams.get("slug") ?? "";
  // Portrait 1080×1920 variant for Instagram / Facebook Stories sharing
  // (?format=story). The default 1200×630 stays the link-preview card.
  const story = (url.searchParams.get("format") ?? "") === "story";

  // The lockup already carries the product name, so the default share card
  // uses the brand tagline as its headline instead of saying "Frederick
  // Radius" twice.
  let title: string = BRAND.tagline;
  // The homepage share card. Says what the product does rather than the
  // old generic "smarter way to experience" line. Deliberately NOT
  // time-baked (no "today" or a specific event): social platforms cache
  // the card at share time, so a dated card would go stale in a feed
  // within a day. The kicker has to read true a week from now.
  let kicker: string = "Frederick County, Maryland";
  // `blurb` is the editorial one-liner shown below the title on place
  // and municipality cards. Stable per-record (not time-bound), so it
  // survives OG-image edge caching without going stale — which is why
  // we don't try to bake open-status into the card here. The card has
  // to read true a day from now.
  let blurb: string | null = null;
  let accent: string = BRAND.colors.brick;
  // Almanac stat row (type=almanac only) — replaces the italic blurb with
  // label/value pairs. The DAY is baked into the URL by the sharer, so each
  // calendar day is a distinct URL and social caches can never serve a stale
  // "today" (the same rule the other cards solve by not being time-bound).
  let stats: { label: string; value: string }[] | null = null;

  if (type === "place") {
    const p = PLACE_BY_SLUG[slug];
    if (p) {
      title = p.name;
      kicker = `${CATEGORY_BY_SLUG[p.category]?.name ?? p.category} · ${p.city}, MD`;
      blurb = p.short_blurb || null;
      accent = CATEGORY_BY_SLUG[p.category]?.color ?? accent;
    }
  } else if (type === "event") {
    const e = EVENT_BY_SLUG[slug];
    if (e) {
      title = e.title;
      kicker = `${e.venue_name} · ${new Date(e.starts_at).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" })}`;
      accent = CATEGORY_BY_SLUG[e.category]?.color ?? accent;
    }
  } else if (type === "municipality") {
    const m = MUNICIPALITY_BY_SLUG[slug];
    if (m) {
      title = m.name;
      kicker = `Frederick County, Maryland · pop. ${m.population.toLocaleString()}`;
      blurb = m.hero_blurb || null;
    }
  } else if (type === "category") {
    const c = CATEGORY_BY_SLUG[slug];
    if (c) {
      title = c.name;
      kicker = "Across Frederick County";
      accent = c.color;
    }
  } else if (type === "collection") {
    // Editorial collections (/collections/[slug]). The blurb already
    // carries the editorial voice, so it reads true a day from now
    // without time-baked context. Accent comes from the collection's
    // own definition. The kicker is fixed ("A Frederick collection")
    // because each card already carries its title as the headline.
    const c = COLLECTION_BY_SLUG[slug];
    if (c) {
      title = c.title;
      kicker = "A Frederick collection";
      blurb = c.blurb;
      // The collection's `accent` is a CSS variable reference, which
      // doesn't resolve inside the OG image runtime (no DOM, no
      // computed styles). Map known accent tokens back to hex so the
      // card renders the same color the in-app card does. Unknown
      // tokens fall through to the default brick.
      accent = COLLECTION_ACCENT_HEX[c.accent] ?? accent;
    }
  } else if (type === "beta") {
    // The Facebook tease card. Not time-baked (social caches at share time),
    // so it reads true whenever it surfaces in a feed.
    title = "You're early.";
    kicker = "Early-access beta · Frederick Radius";
    blurb = "An early look at a local guide to places and events across Frederick County.";
    accent = BRAND.colors.brick;
  } else if (type === "almanac") {
    // The daily almanac card — the one share card that IS time-bound, made
    // cache-safe by requiring the Eastern day in the URL. /today's metadata
    // regenerates the URL each ISR pass, so sharing /today always previews
    // the current day's card.
    const rawDay = url.searchParams.get("day") ?? "";
    const day = /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : easternDayKey(new Date());
    // Noon ET of that calendar day: same UTC calendar day year-round, so the
    // USNO sun math and the ET date label agree on which day this is.
    const anchor = new Date(`${day}T16:00:00Z`);

    title = anchor.toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    kicker = "The daily almanac · Frederick County";

    const fmtTime = (d: Date) =>
      d
        .toLocaleTimeString("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          minute: "2-digit",
        })
        .toLowerCase()
        .replace(" ", "");

    const sun = sunTimes(anchor, FREDERICK_LAT, FREDERICK_LNG);
    const delta = daylightDelta(anchor, FREDERICK_LAT, FREDERICK_LNG);
    const moon = moonPhase(anchor);

    // Today's public event count, timeout-raced: the loader is warm-cron'd
    // every 5 minutes so this almost always resolves instantly, but a cold
    // cache must never make a crawler wait — the card just omits the stat.
    let eventsToday: number | null = null;
    if (day === easternDayKey(new Date())) {
      eventsToday = await Promise.race<number | null>([
        assembleUnifiedEvents(new Date())
          .then(
            (u) =>
              u.publicEvents.filter((e) => easternDayKey(new Date(e.starts_at)) === day)
                .length,
          )
          .catch(() => null),
        new Promise<number | null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);
    }

    // Four stats maximum — five clips the 1200px canvas and a wrapped row
    // orphans whichever stat lands alone. The sun pair and the moon always
    // sit; the fourth seat goes to the event count (the social hook) when
    // the day has one, else to the daylight delta (the season's pulse).
    stats = [];
    if (sun) {
      stats.push({ label: "Sunrise", value: fmtTime(sun.sunrise) });
      stats.push({ label: "Sunset", value: fmtTime(sun.sunset) });
    }
    if (eventsToday !== null && eventsToday > 0) {
      stats.push({ label: "On today", value: `${eventsToday} events` });
    } else if (delta) {
      const d = delta.deltaMinutes;
      stats.push({
        label: "Daylight",
        value: d === 0 ? "steady" : `${d > 0 ? "+" : "-"}${Math.abs(d)} min`,
      });
    }
    stats.push({ label: "Moon", value: moon.name.toLowerCase() });
  } else if (type === "moment") {
    // Civic-moment hubs (/moments/[slug]) — the most-shared, timely content.
    // Not time-baked to a specific clock (social caches at share time); the
    // subtitle reads true across the whole window. Accent token → hex via the
    // shared map so the card matches the in-app hue. (audit)
    const m = momentBySlug(slug);
    if (m) {
      title = m.title;
      kicker = "A Frederick moment";
      blurb = m.subtitle;
      accent = COLLECTION_ACCENT_HEX[m.accent] ?? accent;
    }
  }

  // Resolve CSS-token accents for every card type, not only collections.
  accent = COLLECTION_ACCENT_HEX[accent] ?? accent;

  // Canonical Frederick Radius palette. The generic site/beta card uses the strong
  // Brick campaign frame; object cards stay on Cream so their information is
  // easier to scan when shared. Fonts are embedded below, so the social image
  // uses the same wordmark and UI voices as the product.
  const PAPER = BRAND.colors.cream;
  const INK = BRAND.colors.ink;
  const INK_2 = "#5A5348";
  const INK_3 = BRAND.colors.mutedInk;
  const HAIRLINE = BRAND.colors.border;
  const BRICK = BRAND.colors.brick;
  const SERIF = BRAND.type.display;
  const SANS = "Public Sans";
  const brandFrame = type === "site" || type === "beta";
  const surface = brandFrame ? BRICK : PAPER;
  const foreground = brandFrame ? PAPER : INK;
  const secondary = brandFrame ? "#F8EDE3" : INK_2;
  const quiet = brandFrame ? "#EBC8BC" : INK_3;
  const rule = brandFrame ? "#D9907D" : HAIRLINE;

  // Story (portrait) scales type + padding up for the taller 1080×1920
  // canvas; the landscape 1200×630 keeps its tuned sizes.
  const PAD = story ? 88 : 80;
  const KICK = story ? 28 : 24;
  const TITLE = story ? 104 : 88;
  const BLURB = story ? 40 : 32;
  const FOOT = story ? 26 : 22;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: PAD,
          background: surface,
          color: foreground,
          fontFamily: SANS,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* The oversize off-edge Ripple is the campaign motif. It stays quiet
            enough to frame the content rather than compete with it. */}
        <svg
          viewBox="0 0 100 100"
          width={story ? 980 : 620}
          height={story ? 980 : 620}
          style={{
            position: "absolute",
            right: story ? -320 : -190,
            bottom: story ? -340 : -360,
            opacity: brandFrame ? 0.16 : 0.09,
          }}
        >
          <g fill="none" stroke={brandFrame ? PAPER : BRICK} strokeLinecap="round" strokeWidth={2.4}>
            {RIPPLE_GEOMETRY.full.paths.map((path) => <path key={path} d={path} />)}
          </g>
        </svg>

        {/* Canonical horizontal lockup — two-arc mark + Caslon wordmark. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: story ? 20 : 15,
            color: brandFrame ? PAPER : BRICK,
            position: "relative",
          }}
        >
          <svg viewBox="0 0 100 100" width={story ? 58 : 44} height={story ? 58 : 44}>
            <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={5}>
              {RIPPLE_GEOMETRY.compact.paths.map((path, index) => (
                <path key={path} d={path} strokeOpacity={RIPPLE_GEOMETRY.compact.opacities[index]} />
              ))}
            </g>
            <circle cx="50" cy={RIPPLE_GEOMETRY.compact.baseline} r={RIPPLE_GEOMETRY.compact.dotRadius} fill="currentColor" />
          </svg>
          <div style={{ fontFamily: SERIF, fontSize: story ? 42 : 32, fontWeight: 400, letterSpacing: -0.5 }}>
            Frederick Radius
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, position: "relative" }}>
          {/* Kicker — mono-ish editorial eyebrow, widely tracked
              and uppercased. The Brand Book uses Public Sans / mono
              here, but on the OG card the all-caps tracked treatment
              reads as field-guide kicker regardless of fallback. */}
          <div
            style={{
              fontSize: KICK,
              color: quiet,
              letterSpacing: 3,
              textTransform: "uppercase",
              fontFamily: SANS,
              fontWeight: 700,
            }}
          >
            {kicker}
          </div>
          {/* Title — serif display, the page's editorial weight. */}
          <div
            style={{
              fontFamily: SERIF,
              fontSize: TITLE,
              fontWeight: 400,
              color: foreground,
              letterSpacing: -2,
              lineHeight: 1,
            }}
          >
            {title}
          </div>
          {/* Editorial one-liner — answers the audit's "object state /
              one useful reason" ask without baking time-of-day into a
              cached image. Stable per-record, so it reads true a day
              from now. */}
          {blurb && (
            <div
              style={{
                fontFamily: SANS,
                fontSize: BLURB,
                color: secondary,
                lineHeight: 1.25,
                maxWidth: 900,
              }}
            >
              {blurb.length > 110 ? blurb.slice(0, 107) + "…" : blurb}
            </div>
          )}
          {/* Almanac stat row — label/value plates separated by hairlines,
              the engraved-masthead language at share-card scale. */}
          {stats && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                flexWrap: "wrap",
                gap: story ? 32 : 34,
                rowGap: 24,
                marginTop: story ? 16 : 8,
              }}
            >
              {stats.map((s, i) => (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    paddingLeft: i === 0 ? 0 : story ? 32 : 34,
                    borderLeft: i === 0 ? "none" : `1px solid ${HAIRLINE}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: story ? 22 : 18,
                      color: quiet,
                      letterSpacing: 2.5,
                      textTransform: "uppercase",
                      fontFamily: SANS,
                      fontWeight: 700,
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontFamily: SERIF,
                      fontSize: story ? 44 : 36,
                      fontWeight: 400,
                      color: secondary,
                      lineHeight: 1,
                    }}
                  >
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Footer — hairline rule + domain + type chip */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            position: "relative",
          }}
        >
          <div style={{ width: "100%", height: 1, background: rule }} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              fontSize: FOOT,
              color: secondary,
              fontFamily: SANS,
            }}
          >
            <div>frederickradius.app</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: quiet }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: accent }} />
              {type === "place" ? "Place" : type === "event" ? "Event" : type === "municipality" ? "Town" : type === "category" ? "Category" : type === "collection" ? "Local list" : type === "almanac" ? "Almanac" : "Frederick County"}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: story ? 1080 : 1200,
      height: story ? 1920 : 630,
      fonts: [
        { name: "Libre Caslon Display", data: caslon400, weight: 400, style: "normal" },
        { name: "Public Sans", data: public400, weight: 400, style: "normal" },
        { name: "Public Sans", data: public600, weight: 600, style: "normal" },
        { name: "Public Sans", data: public700, weight: 700, style: "normal" },
      ],
      // June-9 deep audit P2: this route returned max-age=0 and paid a
      // full render on EVERY share/crawler hit. OG content only changes
      // when the underlying record changes (deploys), so cache at the
      // edge for a day and serve stale while revalidating for a week.
      headers: {
        "Cache-Control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
