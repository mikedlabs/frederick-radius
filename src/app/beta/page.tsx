import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import BetaEmailField from "@/components/beta/BetaEmailField";
import CountUp from "@/components/beta/CountUp";
import RevealOnScroll from "@/components/ui/RevealOnScroll";
import { MUNICIPALITIES } from "@/data/municipalities";
import { getBetaPulse } from "@/lib/loaders/betaPulse";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Frederick Radius: private beta",
  // Positioning rev. 2 (docs/social/facebook-page-copy.md): center the
  // city-and-county connection; "a living field guide" is retired copy.
  description:
    "Downtown Frederick and the county, connected. What's open, what's on, and what's worth your time, right now. Now in private beta.",
  // The share card that Facebook renders for the tease post — a dedicated
  // branded "You're early" cover (api/og?type=beta), not the generic site card.
  openGraph: {
    title: "You're early. · Frederick Radius",
    description: "Downtown Frederick and the county, connected. Private beta.",
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
 * The pitch is "the city and the county, connected — right now," so the page
 * proves the "right now": past the fast access gate, real county data streams
 * in (places mapped, what's on today, tonight's Keys score, what's stocked)
 * under a Suspense boundary — the page is literally alive as you read it.
 * Below that: a specimen-card preview, an engraved marquee of all the towns,
 * the manifesto, and a second way in. Access + email-capture logic is
 * unchanged; only the shell grew.
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
            {/* Radar sweep orbiting the mark — the target reads as live radar. */}
            <span aria-hidden className="radar-sweep absolute -inset-2" />
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
            Downtown Frederick and the county, connected: what&rsquo;s open, what&rsquo;s on,
            and what&rsquo;s worth your time. Enter the access code you were given to come in.
          </p>

          {/* Live proof, directly under the headline block — real county data
              (open-now count with names, today's event count), streamed so the
              access gate never waits on it. The page leads with what it
              actually knows before the pitch asks for trust. */}
          <Suspense fallback={<ProofStripShell />}>
            <ProofStrip />
          </Suspense>

          <form action="/api/beta" method="post" className="mx-auto mt-6 max-w-[20rem] space-y-2.5">
            <input type="hidden" name="next" value={safeNext} />
            <input
              type="text"
              name="password"
              required
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Access code"
              placeholder="Access code"
              className="w-full rounded-[var(--app-radius-md)] border px-4 py-3 text-center text-[16px] tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-1"
              style={{
                borderColor: error ? "var(--app-brand)" : "var(--app-border-strong)",
                background: "var(--app-bg-elevated-solid)",
                color: "var(--app-ink)",
                boxShadow: "var(--app-hi)",
              }}
            />
            {error && (
              <p className="text-[12.5px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
                That code did not match. Try again.
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
        </div>

        <span
          aria-hidden
          className="absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.2em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Scroll &darr;
        </span>
      </section>

      {/* ── DIAGNOSTIC — the county is not empty, the info is scattered ─── */}
      <RevealOnScroll>
        <section className="mx-auto max-w-[52rem] px-6 py-16 sm:py-20">
          <PlateHeading eyebrow="Pl. I · diagnostic" title="The county is not empty. The information is just scattered." />
          <p className="mx-auto mt-5 max-w-[52ch] text-center text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            People move fluidly between downtown, the towns, and the county. But
            online, they are forced to become researchers, digging through social
            feeds, stale calendars, and disconnected municipal pages to find what
            is happening.
          </p>
          <DiagnosticPanels />
        </section>
      </RevealOnScroll>

      {/* ── THE SIGNAL — a signal layer, not a directory ───────────────── */}
      <RevealOnScroll>
        <section className="px-6 py-16 sm:py-20" style={{ borderTop: "1px solid var(--app-border)", borderBottom: "1px solid var(--app-border)", background: "color-mix(in srgb, var(--app-brand-2) 5%, transparent)" }}>
          <div className="mx-auto max-w-[52rem]">
            <PlateHeading eyebrow="Pl. II · the signal" title="A local signal layer, not a directory" />
            <p className="mx-auto mt-5 max-w-[52ch] text-center text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              People do not need more information. They need the right local signal
              at the right time. A signal is useful, timely information that helps
              someone act.
            </p>
            <SignalFilter />
          </div>
        </section>
      </RevealOnScroll>

      {/* ── THE LANDSCAPE — what is useful right now (comparison) ───────── */}
      <RevealOnScroll>
        <section className="mx-auto max-w-[52rem] px-6 py-16 sm:py-20">
          <PlateHeading eyebrow="Pl. III · the landscape" title="What is useful right now" />
          <LandscapeTable />
          <p className="mx-auto mt-6 max-w-[40ch] border-l-[3px] pl-4 font-serif text-[18px] font-semibold leading-snug" style={{ borderColor: "var(--app-brand)", color: "var(--app-ink)" }}>
            Social media asks what is getting attention. Frederick Radius asks what is useful right now.
          </p>
        </section>
      </RevealOnScroll>

      {/* ── FREDERICK, RIGHT NOW — the living-almanac proof band ────────── */}
      <RevealOnScroll>
        <section className="mx-auto max-w-[52rem] px-6 py-16 sm:py-20">
          <PlateHeading eyebrow="Pl. IV · proof" title="Frederick, right now" />
          <Suspense fallback={<PulseGridSkeleton />}>
            <PulseGrid />
          </Suspense>
          <p className="mt-4 text-center font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
            Not a brochure. These are the county&rsquo;s numbers, right now.
          </p>
        </section>
      </RevealOnScroll>

      {/* ── WHAT'S INSIDE — specimen preview ───────────────────────────── */}
      <RevealOnScroll>
        <section className="mx-auto max-w-[52rem] px-6 pb-16 sm:pb-20">
          <PlateHeading eyebrow="Pl. V · the guide" title="Every place, on its own card" />
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <SpecimenCard hue="var(--app-accent)" kicker="Brewery · Pl. XII" name="Steinhardt Brewing" line="Open till 10 · 0.4 mi" />
            <SpecimenCard hue="var(--app-brand-2)" kicker="Music · Thu" name="Alive @ Five" line="Carroll Creek · 5 to 8 PM" />
            <SpecimenCard hue="var(--app-cool)" kicker="Town · Pl. I" name="Downtown Frederick" line="Clustered spires · pop. 80,435" />
          </div>
          <p className="mx-auto mt-5 max-w-[30rem] text-center text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Save the ones you love. They land in your pocket, each with a plate
            number and its open-now line.
          </p>
        </section>
      </RevealOnScroll>

      {/* ── INTENT — the questions it answers ──────────────────────────── */}
      <RevealOnScroll>
        <section className="px-6 py-16 sm:py-20" style={{ borderTop: "1px solid var(--app-border)", borderBottom: "1px solid var(--app-border)", background: "color-mix(in srgb, var(--app-brand-2) 5%, transparent)" }}>
          <div className="mx-auto max-w-[52rem]">
            <PlateHeading eyebrow="Pl. VI · intent" title="The questions it answers" />
            <IntentGrid />
            <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
              Scan a QR code or tap a link and get the answer. No app store, no download.
            </p>
          </div>
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
          <PlateHeading eyebrow="Pl. VII · the difference" title="Written by someone who lives here" />
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            <Value title="Answers, not listings" body="It knows what's open now, what's on tonight, and what's worth the drive. Ask in plain words." />
            <Value title="Written by someone local" body="Field notes on the taproom patio, the trail with the overlook, the diner that means it. Not scraped." />
            <Value title="Alive to the day" body="Weather, the game, the market, road closures, a heat cancellation. The county as it actually is, right now." />
          </div>
        </section>
      </RevealOnScroll>

      {/* ── CLOSING — a second way in ──────────────────────────────────── */}
      <RevealOnScroll>
        <section className="mx-auto max-w-[30rem] px-6 pb-20 pt-16 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-3)" }}>
            Pl. VIII · the standard
          </p>
          <CompassRose />
          <p className="mt-2 font-serif text-[30px] font-semibold leading-none tracking-tight" style={{ color: "var(--app-brand)" }}>
            Not louder. Clearer.
          </p>
          <h2 className="mt-8 font-serif text-[30px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            Come see your county.
          </h2>
          <p className="mx-auto mt-3 max-w-[24rem] text-[14.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Have an access code? Scroll back up and come in. No code yet? Leave your
            email and we&rsquo;ll wave you through at launch.
          </p>
          <div className="mt-5">
            <BetaEmailField />
          </div>
          <Link href="#top" className="mt-6 inline-block font-mono text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--app-brand-press)" }}>
            &uarr; Enter an access code
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
        background: `linear-gradient(152deg, color-mix(in srgb, ${hue} 60%, var(--app-ink)), color-mix(in srgb, ${hue} 34%, var(--app-bedrock)))`,
        boxShadow: "0 12px 22px -12px color-mix(in srgb, var(--app-ink) 70%, transparent), 0 0 0 1px color-mix(in srgb, var(--app-ink) 16%, transparent)",
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

/* ── Diagnostic: physical reality vs the scattered digital one ───────── */
function DiagnosticPanels() {
  const physical = [
    "Downtown Frederick",
    "Thurmont · Middletown · Brunswick",
    "Walkersville · Mount Airy · Emmitsburg",
    "One connected county, moved through daily",
  ];
  const scraps = [
    { t: "Stale PDF calendar (May 2023)", bad: false },
    { t: "Event cancelled!", bad: true },
    { t: "3.5 stars", bad: false },
    { t: "Where is it?", bad: true },
    { t: "“hard to navigate”", bad: false },
    { t: "Local concert flyer", bad: false },
    { t: "Dead link", bad: true },
    { t: "Instagram post, 6 weeks ago", bad: false },
    { t: "Which town is this?", bad: true },
  ];
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand-2)" }}>
          Physical reality
        </p>
        <div className="relative overflow-hidden rounded-[var(--app-radius-lg)] border p-4 pb-12" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)", minHeight: 210 }}>
          {physical.map((p) => (
            <div key={p} className="flex items-center gap-2.5 py-1.5 text-[14px]" style={{ color: "var(--app-ink-2)" }}>
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--app-brand-2)" }} />
              {p}
            </div>
          ))}
          <span className="absolute bottom-3 left-4 rounded-[6px] border px-2 py-1 font-mono text-[11px]" style={{ borderColor: "color-mix(in srgb, var(--app-brand) 40%, var(--app-border))", color: "var(--app-brand-press)" }}>
            663 sq miles
          </span>
        </div>
      </div>
      <div>
        <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand-press)" }}>
          Digital reality
        </p>
        <div className="flex flex-wrap content-start gap-2 rounded-[var(--app-radius-lg)] border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)", minHeight: 210 }}>
          {scraps.map((s, i) => (
            <span
              key={i}
              className="rounded-[8px] border border-dashed px-2.5 py-1.5 text-[12px]"
              style={{
                transform: `rotate(${(i % 3) - 1}deg)`,
                color: s.bad ? "var(--app-brand-press)" : "var(--app-ink-3)",
                borderColor: s.bad ? "color-mix(in srgb, var(--app-brand) 40%, var(--app-border))" : "var(--app-border-strong)",
                background: "var(--app-bg)",
              }}
            >
              {s.t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Signal filter: raw feeds → Context/Location/Time → live signals ──── */
function SignalFilter() {
  const inputs = ["Chronological social feeds", "Star ratings", "Static lists", "Stale calendars"];
  const stages = ["Context", "Location", "Time"];
  const signals = ["A food truck is nearby", "An event starts in 20 minutes", "A trail is muddy"];
  return (
    <div className="mt-8 flex flex-col items-center">
      <div className="flex max-w-[34rem] flex-wrap justify-center gap-2">
        {inputs.map((t) => (
          <span key={t} className="rounded-full border px-3 py-1.5 text-[12.5px]" style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink-3)" }}>
            {t}
          </span>
        ))}
      </div>
      <div
        className="relative my-5 flex w-full max-w-[34rem] items-center justify-around gap-2 rounded-[var(--app-radius-md)] border p-4"
        style={{ borderColor: "var(--app-brand-2)", background: "color-mix(in srgb, var(--app-brand-2) 7%, var(--app-bg-elevated-solid))" }}
      >
        <span className="absolute -top-2.5 left-4 px-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em]" style={{ background: "var(--app-bg)", color: "var(--app-brand-2)" }}>
          The Frederick Radius filter
        </span>
        {stages.map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            <span className="rounded-[8px] border px-3 py-2 font-mono text-[13px] font-semibold" style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)" }}>
              {s}
            </span>
            {i < stages.length - 1 && <span aria-hidden style={{ color: "var(--app-ink-3)" }}>&rarr;</span>}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2.5">
        {signals.map((s) => (
          <span
            key={s}
            className="rounded-full px-3.5 py-2 font-mono text-[13px] font-semibold"
            style={{ background: "var(--app-brand)", color: "var(--app-on-brand)", boxShadow: "0 6px 14px -8px color-mix(in srgb, var(--app-brand) 70%, transparent)" }}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Landscape: the comparison table, our column pressed in vermilion ─── */
function LandscapeTable() {
  const rows: Array<[string, string, string, string, string]> = [
    ["Primary output", "Noise", "Pins", "Lists", "Signals"],
    ["Timeliness", "Algorithmic", "Static", "Stale", "Right now"],
    ["Human filter", "None", "Automated", "Variable", "High"],
    ["Core metric", "Attention", "Search volume", "Page views", "Utility & action"],
  ];
  const ours = { background: "color-mix(in srgb, var(--app-brand) 9%, var(--app-bg-elevated-solid))", color: "var(--app-ink)" };
  return (
    <div className="mt-7 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13.5px]" style={{ minWidth: 520 }}>
        <thead>
          <tr>
            <th className="p-3" />
            {["Social media", "Search / maps", "Calendars"].map((h) => (
              <th key={h} className="p-3 font-mono text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)", borderBottom: "1px solid var(--app-border)" }}>
                {h}
              </th>
            ))}
            <th className="p-3 font-mono text-[11px] font-bold uppercase tracking-[0.06em]" style={{ ...ours, color: "var(--app-brand-press)", borderBottom: "1px solid var(--app-border)", borderTopLeftRadius: 10, borderTopRightRadius: 10 }}>
              Frederick Radius
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, a, b, c, mine], ri) => (
            <tr key={label}>
              <th className="p-3 text-[13px] font-semibold" style={{ color: "var(--app-ink-2)", borderBottom: "1px solid var(--app-border)" }}>
                {label}
              </th>
              {[a, b, c].map((v, i) => (
                <td key={i} className="p-3 font-mono text-[12.5px]" style={{ color: "var(--app-ink-2)", borderBottom: "1px solid var(--app-border)" }}>
                  {v}
                </td>
              ))}
              <td
                className="p-3 font-mono text-[12.5px] font-bold"
                style={{ ...ours, borderBottom: "1px solid var(--app-border)", ...(ri === rows.length - 1 ? { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 } : {}) }}
              >
                {mine}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Intent: the questions the guide answers, each with its live answer ─ */
function IntentGrid() {
  const qs: Array<[string, string]> = [
    ["What’s open?", "Its open-now line"],
    ["What’s happening?", "Today’s event list"],
    ["What’s nearby?", "0.4 mi away"],
    ["What’s worth my time?", "Field notes by a local"],
    ["What should I know before I go?", "Weather & road closures"],
    ["How do I get in?", "A link. No app store."],
  ];
  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-3">
      {qs.map(([q, a]) => (
        <div key={q} className="rounded-[var(--app-radius-md)] border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)" }}>
          <p className="font-serif text-[16px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
            {q}
          </p>
          <span className="mt-2.5 inline-block rounded-[6px] px-2.5 py-1.5 font-mono text-[11.5px]" style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}>
            {a}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Compass rose for the closing standard ───────────────────────────── */
function CompassRose() {
  return (
    <svg aria-hidden className="mx-auto h-24 w-24" viewBox="0 0 100 100" fill="none" stroke="var(--app-ink)" strokeWidth={1.2}>
      <circle cx="50" cy="50" r="46" strokeOpacity={0.5} />
      <circle cx="50" cy="50" r="38" strokeOpacity={0.3} />
      <path d="M50 8 L57 50 L50 92 L43 50 Z" fill="var(--app-ink)" stroke="none" />
      <path d="M8 50 L50 43 L92 50 L50 57 Z" fill="none" stroke="var(--app-ink)" strokeOpacity={0.6} />
      <path d="M50 20 L54 50 L50 80 L46 50 Z" fill="var(--app-brand)" stroke="none" transform="rotate(45 50 50)" />
    </svg>
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

/* ── Live proof: the strip under the headline ────────────────────────────
   One quiet card, real data: the county-wide open-now count with two or
   three actual names, plus today's event count. Every field is fail-soft
   (betaPulse) — a fact that can't resolve is omitted, and the always-true
   places-mapped total carries the line when the open count is out. */
async function ProofStrip() {
  const p = await getBetaPulse(new Date());
  const openCount = p.openNow && p.openNow.count > 0 ? p.openNow.count : null;
  const names = p.openNow?.names ?? [];

  // Live signal ticker — a scrolling wire of genuinely-on-now facts drawn from
  // the same pulse, so the cover reads as a feed, not a stat. Every item is
  // real or omitted (honest by construction).
  const signals: string[] = [];
  for (const nm of names) signals.push(`${nm} · open now`);
  if (p.eventsToday != null && p.eventsToday > 0) {
    signals.push(`${p.eventsToday} ${p.eventsToday === 1 ? "event" : "events"} on today`);
  }
  if (p.keys) {
    const k = p.keys;
    // Runs are null before first pitch AND for postponed/cancelled games —
    // never let "null–null" onto the live-proof page. A game without a
    // score to show only earns a signal in its honest states.
    const hasScore = typeof k.keys.runs === "number" && typeof k.opponent.runs === "number";
    if (k.state === "live" && hasScore) signals.push(`Keys ${k.keys.runs}–${k.opponent.runs}, live`);
    else if (k.state === "final" && hasScore) signals.push(`Keys final ${k.keys.runs}–${k.opponent.runs}`);
    else if (k.state === "pre") signals.push("Keys, first pitch tonight");
    else if (k.state === "postponed") signals.push("Keys game postponed");
  }
  if (p.troutThisWeek) signals.push("Trout stocked this week");
  signals.push(`${p.places.toLocaleString()} places mapped`);
  signals.push(`${p.towns} towns, one radius`);
  const ticker = [...signals, ...signals];

  return (
    <>
      <div
        className="mx-auto mt-6 max-w-[24rem] rounded-[var(--app-radius-md)] border px-4 py-3 text-left"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-hi)" }}
      >
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-brand-press)" }}>
          <span aria-hidden className="pulse-dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "var(--app-brand)" }} />
          Right now
        </p>
        <p className="mt-1.5 text-[13.5px] leading-snug" style={{ color: "var(--app-ink)" }}>
          {openCount != null ? (
            <>
              <CountUp value={openCount} className="font-mono font-semibold tabular-nums" />{" "}
              places open across the county
            </>
          ) : (
            <>
              <CountUp value={p.places} className="font-mono font-semibold tabular-nums" />{" "}
              places mapped across the county
            </>
          )}
          {p.eventsToday != null && p.eventsToday > 0 && (
            <>
              {" · "}
              <CountUp value={p.eventsToday} className="font-mono font-semibold tabular-nums" /> on today
            </>
          )}
        </p>
        {openCount != null && names.length >= 2 && (
          <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            Open at this hour: {names.join(", ")}.
          </p>
        )}
      </div>

      {signals.length >= 3 && (
        <div className="bt-marquee mx-auto mt-2.5 max-w-[27rem]" aria-label="Live around the county">
          <div className="bt-marquee-track" style={{ animationDuration: "32s" }}>
            {ticker.map((s, i) => (
              <span key={i} className="inline-flex items-center">
                <span className="px-3 font-mono text-[11px] font-medium tracking-tight" style={{ color: "var(--app-ink-2)" }}>
                  {s}
                </span>
                <span aria-hidden className="h-1 w-1 rounded-full" style={{ background: "var(--app-brand)" }} />
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* Reserves the strip's footprint while it streams so the password form
   doesn't jump when the data lands. */
function ProofStripShell() {
  return (
    <div
      aria-hidden
      className="mx-auto mt-6 h-[116px] max-w-[24rem] animate-pulse rounded-[var(--app-radius-md)] border"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
    />
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
    const k = p.keys;
    // Runs are null before first pitch AND for postponed/cancelled games, so
    // format a score only when both sides have one — otherwise the tile read
    // "null–null" on the page whose whole pitch is live proof.
    const hasScore = typeof k.keys.runs === "number" && typeof k.opponent.runs === "number";
    if ((k.state === "live" || k.state === "final") && hasScore) {
      stats.push({
        n: `${k.keys.runs}–${k.opponent.runs}`,
        label: k.state === "live" ? "Keys, live now" : "Keys, final",
        live: k.state === "live",
      });
    } else if (k.state === "pre") {
      stats.push({ n: "Tonight", label: "Keys first pitch" });
    } else if (k.state === "postponed") {
      stats.push({ n: "Postponed", label: "Keys game" });
    }
    // Cancelled (or a score-less live/final edge) earns no tile.
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
