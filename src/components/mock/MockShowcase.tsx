import Image from "next/image";
import {
  Search, MapPin, Navigation, Phone, Globe, Clock, Bookmark, Share2, ChevronLeft,
  Star, Sparkles, ArrowUpRight, SlidersHorizontal,
} from "lucide-react";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/**
 * MockShowcase — three premium screens (Home · Place · Discover) in the
 * elevated "warm editorial atlas, cinematic photography" language.
 * Presentational only; real photos + data come from the page.
 */

type MockPlace = {
  slug: string;
  name: string;
  category: string;
  color: string;
  photo: string;
  blurb: string;
  rating: number | null;
  reviews: number | null;
  open: boolean;
};

const DISPLAY = { fontFamily: "var(--font-display), Georgia, serif" } as const;
// Premium depth: a tight contact shadow + a soft, far ambient one.
const ELEV = "0 1px 2px rgba(26,24,21,0.05), 0 22px 48px -24px rgba(26,24,21,0.30)";
const ELEV_SM = "0 1px 2px rgba(26,24,21,0.05), 0 10px 26px -16px rgba(26,24,21,0.26)";

function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p
      className="text-[10.5px] font-semibold uppercase"
      style={{ letterSpacing: "0.2em", color: light ? "rgba(255,255,255,0.78)" : "var(--app-ink-3)" }}
    >
      {children}
    </p>
  );
}

function Stars({ rating, reviews }: { rating: number | null; reviews: number | null }) {
  if (rating == null) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <Star className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} style={{ color: "var(--app-accent)" }} aria-hidden />
      <span className="font-semibold tabular-nums">{rating.toFixed(1)}</span>
      {reviews != null && <span style={{ color: "var(--app-ink-3)" }}>({reviews.toLocaleString()})</span>}
    </span>
  );
}

export default function MockShowcase({
  hero,
  cards,
  aerialSrc,
  season,
}: {
  hero: MockPlace;
  cards: MockPlace[];
  aerialSrc: string;
  season: string;
}) {
  const seasonLabel = season.charAt(0).toUpperCase() + season.slice(1);
  const lead = cards[0];
  const rail = cards.slice(1, 4);
  const discover = cards.slice(0, 5);
  const plan = cards.slice(0, 5).map((p, i) => ({
    ...p,
    time: ["9:30 AM", "11:00 AM", "1:00 PM", "3:15 PM", "5:30 PM"][i] ?? "",
    walk: [6, 9, 7, 8][i] ?? 5,
  }));

  return (
    <div style={{ background: "var(--app-bg)" }}>
      {/* ════════════════ SCREEN 1 — HOME (editorial atlas) ════════════════ */}
      <section className="mx-auto min-h-screen w-full max-w-[440px] px-5 pb-10 pt-12">
        {/* Masthead */}
        <div className="flex items-center justify-between">
          <Eyebrow>Frederick Radius</Eyebrow>
          <p className="text-[10.5px] font-semibold uppercase" style={{ letterSpacing: "0.16em", color: "var(--app-ink-3)" }}>
            {seasonLabel} · Wed Evening
          </p>
        </div>
        <div aria-hidden className="mt-3 h-px w-full" style={{ background: "var(--app-border)" }} />

        {/* Cinematic season hero */}
        <div
          className="relative mt-5 overflow-hidden rounded-[26px]"
          style={{ boxShadow: ELEV }}
        >
          <div className="relative aspect-[4/5] w-full">
            <Image src={aerialSrc} alt="Frederick at dusk, from above" fill priority sizes="440px" placeholder="blur" blurDataURL={PAPER_CREAM_BLUR} className="object-cover" />
            <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.32) 0%, transparent 32%, rgba(0,0,0,0.18) 56%, rgba(0,0,0,0.82) 100%)" }} />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <Eyebrow light>Tonight in Frederick</Eyebrow>
              <h1 className="mt-2 text-[40px] font-semibold leading-[0.98] tracking-[-0.015em] text-white" style={DISPLAY}>
                Good evening.
              </h1>
              <p className="mt-2.5 max-w-[30ch] text-[14px] leading-snug text-white/85">
                73° and clear over the Spires. <span className="text-white">142 places open</span> · 3 things on tonight.
              </p>
            </div>
          </div>
        </div>

        {/* Ask bar — premium pill */}
        <button
          type="button"
          className="mt-4 flex w-full items-center gap-3 rounded-full px-5 py-4 text-left"
          style={{ background: "var(--app-bg-elevated-solid)", boxShadow: ELEV_SM, border: "1px solid var(--app-border)" }}
        >
          <Sparkles className="h-[18px] w-[18px] shrink-0" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
          <span className="flex-1 text-[14.5px]" style={{ color: "var(--app-ink-3)" }}>Ask Radius — “patio open now, near me”</span>
          <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
        </button>

        {/* Worth your time — editorial lead + rail */}
        <div className="mt-9 flex items-baseline justify-between">
          <h2 className="text-[22px] font-semibold tracking-[-0.01em]" style={{ ...DISPLAY, color: "var(--app-ink)" }}>Worth your time</h2>
          <span className="inline-flex items-center gap-0.5 text-[12.5px] font-semibold" style={{ color: "var(--app-brand)" }}>
            All <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </span>
        </div>

        {/* Lead card — large */}
        {lead && (
          <div className="mt-3.5 overflow-hidden rounded-[22px]" style={{ background: "var(--app-bg-elevated-solid)", boxShadow: ELEV, border: "1px solid var(--app-border)" }}>
            <div className="relative aspect-[16/10] w-full">
              <Image src={lead.photo} alt={lead.name} fill sizes="440px" placeholder="blur" blurDataURL={PAPER_CREAM_BLUR} className="object-cover" />
              {lead.open && (
                <span className="absolute left-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur" style={{ background: "rgba(255,255,255,0.85)", color: "var(--app-positive)" }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-positive)" }} aria-hidden /> Open now
                </span>
              )}
            </div>
            <div className="p-4">
              <Eyebrow>{lead.category}</Eyebrow>
              <h3 className="mt-1.5 text-[20px] font-semibold leading-tight tracking-[-0.01em]" style={{ ...DISPLAY, color: "var(--app-ink)" }}>{lead.name}</h3>
              <div className="mt-1.5 flex items-center gap-2 text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
                <Stars rating={lead.rating} reviews={lead.reviews} />
              </div>
            </div>
          </div>
        )}

        {/* Compact rail */}
        <ul className="mt-3.5 space-y-3">
          {rail.map((p) => (
            <li key={p.slug} className="flex items-center gap-3.5 rounded-[18px] p-2.5" style={{ background: "var(--app-bg-elevated-solid)", boxShadow: ELEV_SM, border: "1px solid var(--app-border)" }}>
              <span className="relative block h-[60px] w-[60px] shrink-0 overflow-hidden rounded-[14px]">
                <Image src={p.photo} alt={p.name} fill sizes="60px" className="object-cover" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]" style={{ ...DISPLAY, color: "var(--app-ink)" }}>{p.name}</span>
                <span className="mt-0.5 flex items-center gap-2 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                  {p.open && <span style={{ color: "var(--app-positive)", fontWeight: 600 }}>Open</span>}
                  <span className="truncate">{p.category}</span>
                </span>
              </span>
              <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                {p.rating != null ? p.rating.toFixed(1) + "★" : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ════════════════ SCREEN 2 — PLACE DETAIL (cinematic → warm) ════════════════ */}
      <section className="min-h-screen w-full" style={{ background: "var(--app-bg-elevated-solid)" }}>
        {/* Cinematic hero */}
        <div className="relative h-[58vh] min-h-[440px] w-full">
          <Image src={hero.photo} alt={hero.name} fill sizes="100vw" placeholder="blur" blurDataURL={PAPER_CREAM_BLUR} className="object-cover" />
          <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 26%, rgba(0,0,0,0.10) 52%, rgba(0,0,0,0.86) 100%)" }} />
          {/* glass controls */}
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5 pt-12">
            <GlassBtn><ChevronLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden /></GlassBtn>
            <div className="flex gap-2.5">
              <GlassBtn><Share2 className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden /></GlassBtn>
              <GlassBtn><Bookmark className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden /></GlassBtn>
            </div>
          </div>
          {/* identity */}
          <div className="absolute inset-x-0 bottom-0 p-6">
            <Eyebrow light>{hero.category} · Downtown Frederick</Eyebrow>
            <h1 className="mt-2 text-[34px] font-semibold leading-[1.0] tracking-[-0.015em] text-white" style={DISPLAY}>{hero.name}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-white/90">
              {hero.open && (
                <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: "#7BE0A0" }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#7BE0A0" }} aria-hidden /> Open
                </span>
              )}
              <span className="text-white/55">·</span>
              <span>until 10 PM</span>
              <span className="text-white/55">·</span>
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} style={{ color: "var(--app-accent)" }} aria-hidden />
                <span className="font-semibold tabular-nums">{hero.rating != null ? hero.rating.toFixed(1) : "4.6"}</span>
                {hero.reviews != null && <span className="text-white/70">({hero.reviews.toLocaleString()})</span>}
              </span>
              <span className="text-white/55">·</span>
              <span>4-min walk</span>
            </div>
          </div>
        </div>

        {/* Warm content sheet, tucked under the hero */}
        <div className="relative -mt-6 rounded-t-[28px] px-6 pb-12 pt-7" style={{ background: "var(--app-bg-elevated-solid)" }}>
          {/* Action row */}
          <div className="grid grid-cols-4 gap-2.5">
            {[
              { icon: <Navigation className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />, label: "Directions", primary: true },
              { icon: <Phone className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />, label: "Call" },
              { icon: <Globe className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />, label: "Website" },
              { icon: <Clock className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />, label: "Hours" },
            ].map((a) => (
              <div key={a.label} className="flex flex-col items-center gap-1.5">
                <span
                  className="grid h-12 w-full place-items-center rounded-2xl"
                  style={
                    a.primary
                      ? { background: "var(--app-brand)", color: "#fff", boxShadow: ELEV_SM }
                      : { background: "var(--app-bg)", color: "var(--app-ink-2)", border: "1px solid var(--app-border)" }
                  }
                >
                  {a.icon}
                </span>
                <span className="text-[11px] font-medium" style={{ color: "var(--app-ink-3)" }}>{a.label}</span>
              </div>
            ))}
          </div>

          {/* Editorial blurb */}
          {hero.blurb && (
            <p className="mt-7 text-[16.5px] leading-relaxed" style={{ ...DISPLAY, color: "var(--app-ink-2)" }}>
              {hero.blurb}
            </p>
          )}

          {/* tag chips */}
          <div className="mt-5 flex flex-wrap gap-2">
            {["Local favorite", "Dog-friendly", "Patio", "$$"].map((t) => (
              <span key={t} className="rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ background: "var(--app-bg)", color: "var(--app-ink-2)", border: "1px solid var(--app-border)" }}>{t}</span>
            ))}
          </div>

          {/* "From above" strip — the photography signature */}
          <div className="mt-7 overflow-hidden rounded-[20px]" style={{ boxShadow: ELEV_SM }}>
            <div className="relative aspect-[2/1] w-full">
              <Image src={aerialSrc} alt="Downtown Frederick from above" fill sizes="440px" className="object-cover" />
              <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent 60%)" }} />
              <div className="absolute bottom-3.5 left-3.5">
                <Eyebrow light>From above</Eyebrow>
                <p className="text-[15px] font-semibold text-white" style={DISPLAY}>This block from the air</p>
              </div>
            </div>
          </div>

          {/* place-scoped concierge */}
          <div className="mt-5 flex items-center gap-3 rounded-full px-5 py-3.5" style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}>
            <Sparkles className="h-[18px] w-[18px] shrink-0" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
            <span className="text-[14px]" style={{ color: "var(--app-ink-3)" }}>Ask about {hero.name.split(" ")[0]} — parking, hours…</span>
          </div>
        </div>
      </section>

      {/* ════════════════ SCREEN 3 — DISCOVER (filtered list) ════════════════ */}
      <section className="mx-auto min-h-screen w-full max-w-[440px] px-5 pb-12 pt-12">
        <Eyebrow>Discover · Frederick</Eyebrow>
        <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.015em]" style={{ ...DISPLAY, color: "var(--app-ink)" }}>Eat &amp; drink</h1>

        {/* filter row */}
        <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold" style={{ background: "var(--app-ink)", color: "var(--app-bg-elevated-solid)" }}>
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden /> Filters
          </span>
          {["Open now", "Outdoors", "Dog-friendly", "$$", "Top-rated"].map((f, i) => (
            <span key={f} className="shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium" style={i === 0 ? { background: "var(--app-brand-tint-14)", color: "var(--app-brand)", border: "1px solid var(--app-brand-tint-22)" } : { background: "var(--app-bg-elevated-solid)", color: "var(--app-ink-2)", border: "1px solid var(--app-border)" }}>{f}</span>
          ))}
        </div>

        {/* rich list */}
        <ul className="mt-4 space-y-3.5">
          {discover.map((p) => (
            <li key={p.slug} className="overflow-hidden rounded-[20px]" style={{ background: "var(--app-bg-elevated-solid)", boxShadow: ELEV_SM, border: "1px solid var(--app-border)" }}>
              <div className="flex gap-3.5 p-2.5">
                <span className="relative block h-[92px] w-[92px] shrink-0 overflow-hidden rounded-[16px]">
                  <Image src={p.photo} alt={p.name} fill sizes="92px" className="object-cover" />
                </span>
                <span className="min-w-0 flex-1 py-0.5">
                  <Eyebrow>{p.category}</Eyebrow>
                  <span className="mt-1 block truncate text-[17px] font-semibold tracking-[-0.01em]" style={{ ...DISPLAY, color: "var(--app-ink)" }}>{p.name}</span>
                  <span className="mt-1.5 flex items-center gap-2 text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
                    {p.open && (
                      <span className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--app-positive)" }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-positive)" }} aria-hidden /> Open
                      </span>
                    )}
                    <Stars rating={p.rating} reviews={p.reviews} />
                  </span>
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                    <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden /> Downtown · 0.3 mi
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ════════════════ SCREEN 4 — PLAN (itinerary) ════════════════ */}
      <section className="mx-auto min-h-screen w-full max-w-[440px] px-5 pb-12 pt-12">
        <Eyebrow>Your plan · Saturday</Eyebrow>
        <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.015em]" style={{ ...DISPLAY, color: "var(--app-ink)" }}>A day downtown</h1>
        <p className="mt-2 text-[13.5px]" style={{ color: "var(--app-ink-3)" }}>{plan.length} stops · 2.1 mi · about 6 hours</p>

        {/* controls */}
        <div className="mt-4 flex gap-2.5">
          <span className="inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-[13.5px] font-semibold text-white" style={{ background: "var(--app-brand)", boxShadow: ELEV_SM }}>
            <Navigation className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Optimize route
          </span>
          <span className="inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-[13.5px] font-semibold" style={{ background: "var(--app-bg-elevated-solid)", color: "var(--app-ink-2)", border: "1px solid var(--app-border)" }}>
            <Sparkles className="h-4 w-4" strokeWidth={2.25} style={{ color: "var(--app-brand)" }} aria-hidden /> Auto-fill
          </span>
        </div>

        {/* timeline */}
        <ol className="mt-6">
          {plan.map((p, i) => (
            <li key={p.slug}>
              <div className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: "var(--app-brand)", boxShadow: ELEV_SM }}>{i + 1}</span>
                  {i < plan.length - 1 && <span aria-hidden className="my-1 w-px flex-1" style={{ background: "var(--app-border)" }} />}
                </div>
                <div className="flex-1 overflow-hidden rounded-[18px]" style={{ background: "var(--app-bg-elevated-solid)", boxShadow: ELEV_SM, border: "1px solid var(--app-border)" }}>
                  <div className="flex gap-3.5 p-2.5">
                    <span className="relative block h-[64px] w-[64px] shrink-0 overflow-hidden rounded-[13px]">
                      <Image src={p.photo} alt={p.name} fill sizes="64px" className="object-cover" />
                    </span>
                    <span className="min-w-0 flex-1 py-0.5">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                        <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--app-ink-2)" }}>{p.time}</span>
                      </span>
                      <span className="mt-1 block truncate text-[16px] font-semibold tracking-[-0.01em]" style={{ ...DISPLAY, color: "var(--app-ink)" }}>{p.name}</span>
                      <span className="mt-0.5 block truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>{p.category}{p.open ? " · Open" : ""}</span>
                    </span>
                  </div>
                </div>
              </div>
              {i < plan.length - 1 && (
                <div className="ml-[46px] flex items-center gap-1.5 py-2 text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                  <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden /> {p.walk} min walk · Directions
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function GlassBtn({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="grid h-10 w-10 place-items-center rounded-full text-white backdrop-blur"
      style={{ background: "rgba(0,0,0,0.32)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)" }}
    >
      {children}
    </span>
  );
}
