import { ImageResponse } from "next/og";
import { PLACE_BY_SLUG } from "@/data/places";
import { EVENT_BY_SLUG } from "@/data/events";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { CATEGORY_BY_SLUG } from "@/data/categories";

// NOTE: deliberately the Node runtime, NOT edge. This route imports
// the full composed place/event datasets (PLACE_BY_SLUG / EVENT_BY_SLUG)
// for the title + kicker; on the edge runtime the whole dataset is
// bundled into the function and exceeds Vercel's 1 MB edge limit
// ("Edge Function api/og size is 1.09 MB"). Node serverless functions
// have a far larger limit and next/og's ImageResponse runs there too,
// so this fixes the deploy error with zero loss of functionality.
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "site";
  const slug = url.searchParams.get("slug") ?? "";

  let title = "Frederick Radius";
  let kicker = "A smarter way to experience Frederick County";
  // `blurb` is the editorial one-liner shown below the title on place
  // and municipality cards. Stable per-record (not time-bound), so it
  // survives OG-image edge caching without going stale — which is why
  // we don't try to bake open-status into the card here. The card has
  // to read true a day from now.
  let blurb: string | null = null;
  let accent = "#A8462C";

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
  }

  // OG card palette — Brand Book No. 01 (May 2026): paper cream
  // ground, warm ink, almanac brick, hairline rule, ink-2 mid-grey
  // for kicker + footer. Serif fallback stack so the social card
  // reads as field-guide print, not SaaS dashboard. Newsreader +
  // Instrument Serif aren't loaded here yet — that needs woff2
  // bundling (follow-up). For now the fallback serif chain renders
  // a respectable system serif on Vercel's @vercel/og runtime.
  const PAPER = "#F4EFE6";
  const PAPER_2 = "#ECE5D5";
  const INK = "#1A1815";
  const INK_2 = "#4A4844";
  const INK_3 = "#6A6862";
  const HAIRLINE = "#D9D2C3";
  const SERIF = "Newsreader, 'Iowan Old Style', Georgia, 'Times New Roman', serif";
  const ITALIC = "'Instrument Serif', Newsreader, Georgia, serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: `linear-gradient(135deg, ${PAPER} 0%, ${PAPER_2} 100%)`,
          fontFamily: SERIF,
        }}
      >
        {/* Masthead — wordmark + brick dot */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 24,
            fontWeight: 600,
            color: accent,
            letterSpacing: -0.5,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: PAPER,
              }}
            />
          </div>
          Frederick Radius
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Kicker — mono-ish editorial eyebrow, widely tracked
              and uppercased. The Brand Book uses Public Sans / mono
              here, but on the OG card the all-caps tracked treatment
              reads as field-guide kicker regardless of fallback. */}
          <div
            style={{
              fontSize: 24,
              color: INK_3,
              letterSpacing: 3,
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            {kicker}
          </div>
          {/* Title — serif display, the page's editorial weight. */}
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 88,
              fontWeight: 700,
              color: INK,
              letterSpacing: -2,
              lineHeight: 1,
            }}
          >
            {title}
          </div>
          {/* Editorial one-liner — answers the audit's "object state /
              one useful reason" ask without baking time-of-day into a
              cached image. Stable per-record, so it reads true a day
              from now. Set in Instrument Serif italic — the Brand
              Book voice for taglines + pull-quotes. */}
          {blurb && (
            <div
              style={{
                fontFamily: ITALIC,
                fontStyle: "italic",
                fontSize: 32,
                color: INK_2,
                lineHeight: 1.25,
                maxWidth: 900,
              }}
            >
              {blurb.length > 110 ? blurb.slice(0, 107) + "…" : blurb}
            </div>
          )}
        </div>
        {/* Footer — hairline rule + domain + type chip */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ width: "100%", height: 1, background: HAIRLINE }} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              fontSize: 22,
              color: INK_2,
            }}
          >
            <div>frederickradius.app</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: INK_3 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: accent }} />
              {type === "place" ? "Place" : type === "event" ? "Event" : type === "municipality" ? "Town" : type === "category" ? "Category" : "Local discovery"}
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
