import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import {
  DoorOpen, CalendarHeart, Activity, Bus, Waves, Truck, Wine,
  ShoppingBasket, NotebookPen, HeartPulse, Search, Bookmark,
  type LucideIcon,
} from "lucide-react";
import BetaEmailField from "@/components/beta/BetaEmailField";
import CountUp from "@/components/beta/CountUp";
import CountyPlate from "@/components/beta/CountyPlate";
import RevealOnScroll from "@/components/ui/RevealOnScroll";
import { MUNICIPALITIES } from "@/data/municipalities";
import { getBetaPulse } from "@/lib/loaders/betaPulse";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Frederick Radius: private beta",
  // Positioning rev. 3 (owner call, Jul 2026): lead with the field-guide
  // statement, the app's own "what is this?" line from /today. The plain noun
  // "field guide" is on-voice; only the adjective "living field guide" stays
  // retired (docs/VOICE.md).
  description:
    "Your field guide to Frederick County. What's open, what's on, and what's worth your time, right now. Now in private beta.",
  // The share card Facebook renders for the tease post (api/og?type=beta),
  // not the generic site card.
  openGraph: {
    title: "Your field guide to Frederick County",
    description: "Frederick County, live: what's open, what's on, and what's worth your time. Private beta.",
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
 * The page SHOWS more than it tells (owner call, 2026-07: less text, more
 * wow). Past the fast access gate, real county data streams in (places
 * mapped, what's on today, tonight's Keys score) so the page is literally
 * alive as you read it. The scroll is short and visual: the problem (one
 * line + the scattered-scraps panels), the breadth (a capability bento of
 * every live layer the guide carries), the live proof, a specimen card, the
 * towns marquee, the difference, and a second way in. The wordy concept
 * sections (signal-filter diagram, comparison table, Q&A grid) were retired
 * in favour of the bento, which shows the same value with far less prose.
 * Access + email-capture logic is unchanged. All motion is reduced-motion
 * safe and avoids heavy blur.
 */
export default async function BetaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; code?: string }>;
}) {
  const { next, error, code } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/today";
  // Invite emails link here with ?code=frederick-xxxx so the field arrives
  // filled in and the tester only taps "Come in". Strict shape check: this
  // lands in a controlled input, never render arbitrary query strings.
  const prefillCode = code && /^[a-z0-9-]{1,40}$/.test(code) ? code : undefined;
  const rings = [70, 130, 195, 265, 340, 420, 505];

  return (
    <main id="top" className="relative overflow-hidden" style={{ background: "var(--app-bg)", backgroundImage: "var(--app-paper-light)" }}>
      {/* ── HERO — the access cover ────────────────────────────────────── */}
      {/* gridTemplateColumns minmax(0,1fr): the single auto column otherwise
          sizes to the hero's max-content (the 27rem block beats a 390px
          phone) and the whole cover renders wider than the viewport, clipping
          the pitch, the code field, and the Come in button on the right
          (fresh-eyes audit, Jul 2026). minmax(0,1fr) pins the track to the
          available width so content wraps instead of overflowing. */}
      <section
        className="relative grid overflow-hidden px-6"
        style={{ minHeight: "100dvh", placeItems: "center", gridTemplateColumns: "minmax(0, 1fr)" }}
      >
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

          <h1 className="mt-3 font-serif font-semibold leading-[1.03] tracking-tight" style={{ color: "var(--app-ink)", fontSize: "clamp(34px, 8.5vw, 52px)" }}>
            Your field guide to Frederick County.
          </h1>

          <p className="mx-auto mt-4 max-w-[24rem] text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            You&rsquo;re early, so enter the access code you were given to come in.
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
              defaultValue={prefillCode}
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
          <PlateHeading eyebrow="Pl. I · the problem" title="The county isn't empty. It's scattered." />
          <p className="mx-auto mt-5 max-w-[44ch] text-center text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Everything worth doing is out there. Finding it means a dozen tabs:
            stale calendars, dead links, and a different page for every town.
          </p>
          <DiagnosticPanels />
        </section>
      </RevealOnScroll>

      {/* ── WHAT IT DOES — the breadth, as an icon bento (the wow) ──────── */}
      <RevealOnScroll>
        <section className="px-6 py-16 sm:py-20" style={{ borderTop: "1px solid var(--app-border)", borderBottom: "1px solid var(--app-border)", background: "color-mix(in srgb, var(--app-brand-2) 5%, transparent)" }}>
          <div className="mx-auto max-w-[56rem]">
            <PlateHeading eyebrow="Pl. II · one radius" title="The whole county, live" />
            <p className="mx-auto mt-5 max-w-[40ch] text-center text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              One link. No app store. Everything below is on right now.
            </p>
            <CapabilityBento />
          </div>
        </section>
      </RevealOnScroll>

      {/* ── FREDERICK, RIGHT NOW — the living-almanac proof band ────────── */}
      <RevealOnScroll>
        <section className="mx-auto max-w-[52rem] px-6 py-16 sm:py-20">
          <PlateHeading eyebrow="Pl. III · proof" title="Frederick, right now" />
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
          <PlateHeading eyebrow="Pl. IV · the guide" title="Every place, on its own card" />
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <SpecimenCard hue="var(--app-accent)" kicker="Brewery · Pl. XII" name="Steinhardt Brewing" line="Open till 10 · 0.4 mi" />
            <SpecimenCard hue="var(--app-brand-2)" kicker="Music · Thu" name="Alive @ Five" line="Carroll Creek · 5 to 8 PM" />
            <SpecimenCard hue="var(--app-cool)" kicker="City · Pl. I" name="Downtown Frederick" line="Clustered spires · Carroll Creek" />
          </div>
          <p className="mx-auto mt-5 max-w-[30rem] text-center text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Save the ones you love. They land in your pocket, each with a plate
            number and its open-now line.
          </p>
        </section>
      </RevealOnScroll>

      {/* ── THE TOWNS — a static engraved county plate ─────────────────── */}
      <RevealOnScroll>
        <section className="px-6 py-14 sm:py-16" style={{ borderTop: "1px solid var(--app-border)", borderBottom: "1px solid var(--app-border)", background: "color-mix(in srgb, var(--app-brand-2) 5%, transparent)" }}>
          <p className="mb-6 text-center font-mono text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--app-brand-2)" }}>
            {MUNICIPALITIES.length} communities, one radius
          </p>
          <CountyPlate />
        </section>
      </RevealOnScroll>

      {/* ── MANIFESTO — a field guide, not a directory ─────────────────── */}
      <RevealOnScroll>
        <section className="mx-auto max-w-[52rem] px-6 py-16 sm:py-20">
          <PlateHeading eyebrow="Pl. V · the difference" title="Written by someone who lives here" />
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
            Pl. VI · the standard
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
            <span>{MUNICIPALITIES.length} communities</span>
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

/* ── Capability bento: what the app actually surfaces, right now ─────────
   The wow that shows breadth without prose — every tile is a real live
   layer the guide carries. Icon-led, one line each, no paragraphs. */
const CAPABILITIES: Array<{ icon: LucideIcon; label: string; line: string; ink: string }> = [
  { icon: DoorOpen, label: "Open right now", line: "Every place, hours-aware", ink: "var(--app-positive)" },
  { icon: CalendarHeart, label: "Tonight's events", line: "Concerts, markets, Pride", ink: "var(--app-brand)" },
  { icon: Activity, label: "County pulse", line: "Traffic, power, schools, live", ink: "var(--app-brand)" },
  { icon: Bus, label: "Live bus map", line: "TransIT, tracked in real time", ink: "var(--app-cool)" },
  { icon: Waves, label: "River levels", line: "USGS gauges, flood-aware", ink: "var(--app-cool)" },
  { icon: Truck, label: "Food trucks", line: "Who's rolling, and where", ink: "var(--app-accent)" },
  { icon: Wine, label: "Happy hours", line: "Pouring right now", ink: "var(--app-accent)" },
  { icon: ShoppingBasket, label: "Farmers markets", line: "Open today", ink: "var(--app-brand-2)" },
  { icon: NotebookPen, label: "Field notes", line: "Insider tips, by a local", ink: "var(--app-brand)" },
  { icon: HeartPulse, label: "Emergency vet", line: "24/7, when it counts", ink: "var(--app-brand)" },
  { icon: Search, label: "Ask in plain words", line: "“coffee open now”", ink: "var(--app-ink-2)" },
  { icon: Bookmark, label: "Save your radius", line: "The county, in your pocket", ink: "var(--app-brand-2)" },
];

function CapabilityBento() {
  return (
    <ul className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {CAPABILITIES.map((c) => {
        const Icon = c.icon;
        return (
          <li
            key={c.label}
            className="flex items-start gap-3 rounded-[var(--app-radius-md)] border p-3.5"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}
          >
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
              style={{
                background: `color-mix(in srgb, ${c.ink} 14%, var(--app-bg-elevated))`,
                color: `color-mix(in srgb, ${c.ink} 82%, var(--app-ink))`,
                boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-ink) 8%, transparent), var(--app-hi)",
              }}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <span className="min-w-0">
              <span className="block font-serif text-[14.5px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
                {c.label}
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                {c.line}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
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

/* ── Live proof: the strip under the headline ────────────────────────────
   One quiet card, real data: the county-wide open-now count with two or
   three actual names, plus today's event count. Every field is fail-soft
   (betaPulse) — a fact that can't resolve is omitted, and the always-true
   places-mapped total carries the line when the open count is out. */
async function ProofStrip() {
  const p = await getBetaPulse(new Date());
  const openCount = p.openNow && p.openNow.count > 0 ? p.openNow.count : null;
  const names = p.openNow?.names ?? [];

  // One quiet, STATIC card (the scrolling live ticker was retired, owner call
  // Jul 2026: no scrolling text on the cover). Real data, fail-soft: the
  // always-true places total carries the line when the open count is out. The
  // full breadth of live signals lives in the PulseGrid section below.
  return (
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
    { n: String(p.towns), label: "communities, one radius" },
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
