import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import BetaEmailField from "@/components/beta/BetaEmailField";
import RevealOnScroll from "@/components/ui/RevealOnScroll";
import { MUNICIPALITIES } from "@/data/municipalities";
import { getBetaPulse } from "@/lib/loaders/betaPulse";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Frederick Radius: private beta",
  description:
    "A living field guide to Frederick County. What's open, what's on, and what's worth your time. Now in private beta.",
  // The share card that Facebook renders for the tease post — a dedicated
  // branded "You're early" cover (api/og?type=beta), not the generic site card.
  openGraph: {
    title: "You're early. · Frederick Radius",
    description: "A living field guide to Frederick County. Private beta.",
    images: [{ url: "/api/og?type=beta", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

/**
 * /beta — the shared-password unlock screen, rebuilt as a LIVING ALMANAC launch
 * cover for the Facebook tease. Lives outside the (app) group (root layout only).
 * The middleware redirects un-unlocked visitors here with a `next` param; the
 * form posts to /api/beta, which sets the unlock cookie and returns them.
 *
 * The whole pitch is "a living field guide," so the page proves it: past the
 * fast access gate, real county data streams in (places mapped, what's on today,
 * tonight's Keys score, what's stocked) under a Suspense boundary — the page is
 * literally alive as you read it. Below that: a specimen-card preview, an
 * engraved marquee of all the towns, the field-guide manifesto, and a second
 * way in. Access + email-capture logic is unchanged; only the shell grew.
 * All motion reuses reduced-motion-safe keyframes and avoids heavy blur.
 */
export default async function BetaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/today";
  const rings = [70, 130, 195, 265, 340, 420, 505];

  return (
    <main className="relative overflow-hidden" style={{ background: "var(--app-bg)", backgroundImage: "var(--app-paper-light)" }}>
      {/* ── HERO — the access cover ────────────────────────────────────── */}
      <section className="relative grid overflow-hidden px-6" style={{ minHeight: "100dvh", placeItems: "center" }}>
        <svg
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2"
          style={{ width: "min(150vmax, 1500px)", height: "min(150vmax, 1500px)", transform: "translate(-50%, -50%)" }}
          viewBox="0 0 1000 1000"
          fill="none"
        >
          {rings.map((r) => (
            <circle key={r} cx="500" cy="500" r={r} stroke="var(--app-ink)" strokeOpacity={0.05} strokeWidth={1.25} />
          ))}
        </svg>
        <div
          aria-hidden
          className="bt-drift pointer-events-none absolute left-1/2 top-[36%]"
          style={{
            width: "72vmin",
            height: "72vmin",
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle, color-mix(in srgb, var(--app-brand) 16%, transparent) 0%, transparent 62%)",
          }}
        />

        <div className="relative z-10 w-full max-w-[27rem] text-center">
          {/* Radius hero mark — rippling rings + breathing vermilion center. */}
          <div className="relative mx-auto grid h-24 w-24 place-items-center">
            <span aria-hidden className="radius-ripple absolute inset-0 rounded-full" style={{ border: "2px solid var(--app-brand)" }} />
            <span aria-hidden className="radius-ripple absolute inset-0 rounded-full" style={{ border: "2px solid var(--app-brand)", animationDelay: "1400ms" }} />
            <span aria-hidden className="absolute inset-[18px] rounded-full" style={{ border: "1.5px solid color-mix(in srgb, var(--app-brand) 38%, transparent)" }} />
            <span aria-hidden className="radius-breathe h-7 w-7 rounded-full" style={{ background: "var(--app-brand)", boxShadow: "0 4px 16px -4px color-mix(in srgb, var(--app-brand) 70%, transparent)" }} />
          </div>

          <p className="mt-7 inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--app-brand-press)" }}>
            <span aria-hidden className="pulse-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-brand)" }} />
            Private beta
          </p>

          <h1 className="mt-3 font-serif font-semibold leading-[0.95] tracking-tight" style={{ color: "var(--app-ink)", fontSize: "clamp(46px, 13vw, 66px)" }}>
            You&rsquo;re early.
          </h1>

          <p className="mx-auto mt-4 max-w-[23rem] text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            A living field guide to Frederick County: what&rsquo;s open, what&rsquo;s on, and
            what&rsquo;s worth your time. Enter the password you were given to come in.
          </p>

          <form action="/api/beta" method="post" className="mx-auto mt-6 max-w-[20rem] space-y-2.5">
            <input type="hidden" name="next" value={safeNext} />
            <input
              type="password"
              name="password"
              required
              autoComplete="off"
              aria-label="Beta password"
              placeholder="Password"
              className="w-full rounded-[var(--app-radius-md)] border px-4 py-3 text-center text-[16px] tracking-wide focus:outline-none"
              style={{
                borderColor: error ? "var(--app-brand)" : "var(--app-border-strong)",
                background: "var(--app-bg-elevated-solid)",
                color: "var(--app-ink)",
                boxShadow: "var(--app-hi)",
              }}
            />
            {error && (
              <p className="text-[12.5px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
                That password did not match. Try again.
              </p>
            )}
            <button
              type="submit"
              className="tactile-interactive w-full rounded-[var(--app-radius-md)] px-4 py-3 text-[15px] font-semibold tracking-tight active:scale-[0.99]"
              style={{
                background: "var(--app-brand)",
                color: "var(--app-on-brand)",
                boxShadow: "0 10px 24px -10px color-mix(in srgb, var(--app-brand) 70%, transparent), var(--app-hi)",
              }}
            >
              Come in &rarr;
            </button>
          </form>

          <BetaEmailField />

          {/* Live proof line — streams in; the gate above never waits on it. */}
          <Suspense fallback={null}>
            <PulseLine />
          </Suspense>
        </div>

        <span
          aria-hidden
          className="absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.2em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Scroll &darr;
        </span>
      </section>

      {/* ── FREDERICK, RIGHT NOW — the living-almanac proof band ────────── */}
      <RevealOnScroll>
        <section className="mx-auto max-w-[52rem] px-6 py-16 sm:py-20">
          <PlateHeading eyebrow="Pl. I · proof" title="Frederick, right now" />
          <Suspense fallback={<PulseGridSkeleton />}>
            <PulseGrid />
          </Suspense>
          <p className="mt-4 text-center font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
            Not a brochure. This page is reading the county live.
          </p>
        </section>
      </RevealOnScroll>

      {/* ── WHAT'S INSIDE — specimen preview ───────────────────────────── */}
      <RevealOnScroll>
        <section className="mx-auto max-w-[52rem] px-6 pb-16 sm:pb-20">
          <PlateHeading eyebrow="Pl. II · the guide" title="Every place, pressed into a card" />
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <SpecimenCard hue="#C0871F" kicker="Brewery · Pl. XII" name="Steinhardt Brewing" line="Open till 10 · 0.4 mi" />
            <SpecimenCard hue="#7E2C6F" kicker="Live music · Thu" name="Alive @ Five" line="Carroll Creek · 5 to 8 PM" />
            <SpecimenCard hue="#20506A" kicker="Town · Pl. I" name="Downtown Frederick" line="Clustered spires · pop. 80,435" />
          </div>
          <p className="mx-auto mt-5 max-w-[30rem] text-center text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Save the ones you love. They fan out in your pocket like a wallet of
            field specimens, each with a plate number and a live open-now line.
          </p>
        </section>
      </RevealOnScroll>

      {/* ── THE TOWNS — engraved marquee ───────────────────────────────── */}
      <RevealOnScroll>
        <section className="py-14 sm:py-16" style={{ borderTop: "1px solid var(--app-border)", borderBottom: "1px solid var(--app-border)", background: "color-mix(in srgb, var(--app-brand-2) 5%, transparent)" }}>
          <p className="mb-6 text-center font-mono text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--app-brand-2)" }}>
            {MUNICIPALITIES.length} towns, one radius
          </p>
          <TownMarquee />
        </section>
      </RevealOnScroll>

      {/* ── MANIFESTO — a field guide, not a directory ─────────────────── */}
      <RevealOnScroll>
        <section className="mx-auto max-w-[52rem] px-6 py-16 sm:py-20">
          <PlateHeading eyebrow="Pl. III · the difference" title="A field guide, not a directory" />
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            <Value title="Answers, not listings" body="It knows what's open now, what's on tonight, and what's worth the drive. Ask in plain words." />
            <Value title="Written by someone local" body="Field notes on the taproom patio, the trail with the overlook, the diner that means it. Not scraped." />
            <Value title="Alive to the day" body="Weather, the game, the market, road closures, a heat cancellation. The county as it actually is, right now." />
          </div>
        </section>
      </RevealOnScroll>

      {/* ── CLOSING — a second way in ──────────────────────────────────── */}
      <RevealOnScroll>
        <section className="mx-auto max-w-[30rem] px-6 pb-20 text-center">
          <h2 className="font-serif text-[30px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            Come see your county.
          </h2>
          <p className="mx-auto mt-3 max-w-[24rem] text-[14.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Have a password? Scroll back up and come in. No password yet? Leave your
            email and we&rsquo;ll wave you through at launch.
          </p>
          <div className="mt-5">
            <BetaEmailField />
          </div>
          <Link href="#top" className="mt-6 inline-block font-mono text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--app-brand-press)" }}>
            &uarr; Enter a password
          </Link>
          <div
            className="mx-auto mt-8 flex max-w-[24rem] items-center justify-center gap-2.5 border-t pt-3 font-mono text-[10.5px] uppercase tracking-[0.12em]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            <span>{MUNICIPALITIES.length} towns</span>
            <span aria-hidden style={{ color: "var(--app-brand)" }}>·</span>
            <span>663 sq mi</span>
            <span aria-hidden style={{ color: "var(--app-brand)" }}>·</span>
            <span>est. 1748</span>
          </div>
        </section>
      </RevealOnScroll>
    </main>
  );
}

/* ── Section heading: the field-guide plate lockup ───────────────────── */
function PlateHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="text-center">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--app-brand-press)" }}>
        {eyebrow}
      </p>
      <h2 className="mx-auto mt-2 max-w-[24ch] font-serif font-semibold leading-[1.02] tracking-tight" style={{ color: "var(--app-ink)", fontSize: "clamp(28px, 6vw, 40px)" }}>
        {title}
      </h2>
    </div>
  );
}

/* ── Value prop with an engraved rule ────────────────────────────────── */
function Value({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <span aria-hidden className="block h-[3px] w-8 rounded-full" style={{ background: "var(--app-brand)" }} />
      <h3 className="mt-3 font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
        {title}
      </h3>
      <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        {body}
      </p>
    </div>
  );
}

/* ── Specimen preview card (static, real examples) ───────────────────── */
function SpecimenCard({ hue, kicker, name, line }: { hue: string; kicker: string; name: string; line: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] p-4"
      style={{
        minHeight: 132,
        color: "var(--app-ink-inverse)",
        background: `linear-gradient(152deg, color-mix(in srgb, ${hue} 60%, #16140E), color-mix(in srgb, ${hue} 34%, #0c0a06))`,
        boxShadow: "0 12px 22px -12px rgba(22,20,14,.7), 0 0 0 1px rgba(22,20,14,.16)",
      }}
    >
      <span aria-hidden className="bt-guilloche" />
      <span aria-hidden className="bt-sheen" />
      <div className="relative z-[1]">
        <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em]" style={{ opacity: 0.82 }}>
          {kicker}
        </p>
        <p className="mt-6 font-serif text-[19px] font-semibold leading-tight">{name}</p>
        <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.08em]" style={{ opacity: 0.9 }}>
          {line}
        </p>
      </div>
    </div>
  );
}

/* ── The towns marquee (duplicated track for a seamless loop) ─────────── */
function TownMarquee() {
  const names = MUNICIPALITIES.map((m) => m.name);
  const run = [...names, ...names];
  return (
    <div className="bt-marquee">
      <div className="bt-marquee-track">
        {run.map((n, i) => (
          <span key={i} className="inline-flex items-center">
            <span className="px-5 font-serif text-[22px] font-medium tracking-tight" style={{ color: "var(--app-ink)" }}>
              {n}
            </span>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-brand)" }} />
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Live proof: the compact hero line ───────────────────────────────── */
async function PulseLine() {
  const p = await getBetaPulse(new Date());
  const bits: string[] = [`${p.places.toLocaleString()} places mapped`];
  if (p.eventsToday && p.eventsToday > 0) bits.push(`${p.eventsToday} on today`);
  if (p.keys) {
    bits.push(
      p.keys.state === "live"
        ? `Keys ${p.keys.keys.runs}–${p.keys.opponent.runs} live`
        : p.keys.state === "final"
          ? `Keys ${p.keys.keys.runs}–${p.keys.opponent.runs} final`
          : "Keys play today",
    );
  }
  if (p.troutThisWeek) bits.push("trout stocked this week");
  return (
    <p className="mx-auto mt-6 max-w-[22rem] font-mono text-[10.5px] uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
      <span aria-hidden className="pulse-dot mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "var(--app-brand)" }} />
      {bits.join("  ·  ")}
    </p>
  );
}

/* ── Live proof: the full stat grid ──────────────────────────────────── */
async function PulseGrid() {
  const p = await getBetaPulse(new Date());
  const stats: Array<{ n: string; label: string; live?: boolean }> = [
    { n: p.places.toLocaleString(), label: "places mapped" },
    { n: String(p.towns), label: "towns, one radius" },
  ];
  if (p.eventsToday != null) stats.push({ n: String(p.eventsToday), label: p.eventsToday === 1 ? "event on today" : "events on today", live: true });
  if (p.keys) {
    stats.push({
      n: p.keys.state === "pre" ? "Tonight" : `${p.keys.keys.runs}–${p.keys.opponent.runs}`,
      label: p.keys.state === "live" ? "Keys, live now" : p.keys.state === "final" ? "Keys, final" : "Keys first pitch",
      live: p.keys.state === "live",
    });
  }
  return (
    <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s, i) => (
        <div
          key={i}
          className="rounded-[var(--app-radius-lg)] border p-4 text-center"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-hi)" }}
        >
          <p className="font-mono text-[26px] font-semibold tabular-nums leading-none" style={{ color: "var(--app-ink)" }}>
            {s.n}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            {s.live && <span aria-hidden className="pulse-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-brand)" }} />}
            {s.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function PulseGridSkeleton() {
  return (
    <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[92px] animate-pulse rounded-[var(--app-radius-lg)] border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }} />
      ))}
    </div>
  );
}
