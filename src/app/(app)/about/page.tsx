import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Sparkles,
  Store,
} from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import MunicipalityStrip from "@/components/today/MunicipalityStrip";
import CountyOverviewLazy from "@/components/muni/CountyOverviewLazy";

/**
 * /about — the thesis page.
 *
 * Existed-only-in-code until now: every other surface assumes the
 * visitor knows what Frederick Radius is. This page says it plainly.
 * Three blocks: why we exist, what we promise, what we deliberately
 * don't do. The honesty constraints (no fabricated data, only-when-
 * verified rendering) ARE the value proposition; they get the most
 * prominent block.
 *
 * Discoverable from the welcome footer (the moment a new visitor
 * skips onboarding, this is the one tap that explains what they're
 * looking at) and from the Today page footer. Not in primary nav —
 * a thesis page is a "read once" surface, not a destination.
 */

export const metadata: Metadata = {
  title: "About",
  description:
    "Frederick Radius is a hyperlocal field guide. What it is, what it isn't, and why it exists.",
};

export default function AboutPage() {
  return (
    <div className="relative space-y-7">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/today"
          className="inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Back to Today
        </Link>
      </nav>

      <header className="space-y-3">
        <p
          className="eyebrow inline-flex items-center gap-1.5"
          style={{ color: "var(--app-ink-3)" }}
        >
          <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          About Frederick Radius
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          A field guide for Frederick County.
        </h1>
        <p
          className="text-[16px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          What&apos;s open, what&apos;s happening, what&apos;s worth your
          time. Built locally, kept honest, designed for the way you
          actually use a phone.
        </p>

        {/* Primary CTA. Lives here because middleware now sends a
            not-yet-onboarded visitor to /about first; without a clear
            next step the page is a brochure, not a doorway. The
            secondary link is for the small subset of first-time
            visitors who want the persona-tuning step. */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link
            href="/welcome"
            className="tactile tactile-interactive inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-semibold"
            style={{ background: "var(--app-brand)", color: "white" }}
          >
            See what&apos;s useful today
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </Link>
          <Link
            href="/trust"
            className="text-[13px] font-medium hover:underline"
            style={{ color: "var(--app-ink-3)" }}
          >
            How we know what we know
          </Link>
        </div>
      </header>

      {/* THE BET — the one sentence the whole guide flows from.
          Voice Guide v1 §01. Pulled out of body copy and given a
          quiet pull-quote treatment so it reads as the page's spine,
          not a buried line in a thesis paragraph. */}
      <figure
        className="relative my-2 border-l-2 pl-5"
        style={{ borderColor: "var(--app-brand)" }}
      >
        <p
          className="eyebrow mb-2"
          style={{ color: "var(--app-ink-3)" }}
        >
          The bet
        </p>
        <blockquote
          className="font-serif text-[22px] font-medium italic leading-snug tracking-tight text-pretty sm:text-[24px]"
          style={{ color: "var(--app-ink)" }}
        >
          A county-scoped app, when it&apos;s honest and actually local,
          beats a national app pretending to know your town.
        </blockquote>
      </figure>

      {/* COUNTY OVERVIEW — the spatial answer to "what is this?".
          We talk about covering 12 municipalities; this proves it
          visually. The lazy-loaded Mapbox view fits to the county
          bbox, drops a pin on each town, links each pin to /m/[slug].
          No nav controls, no layer chrome — one look, one tap. */}
      <section className="space-y-3">
        <h2
          className="font-serif text-[15px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink-2)" }}
        >
          The whole county, not just downtown.
        </h2>
        <CountyOverviewLazy />
        {/* Strip below the map: same 12 towns as editorial tiles so
            the page reads as spatial-then-textual, and each town
            surfaces a "live this week" chip when there's anything on. */}
        <MunicipalityStrip />
        <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          Tap any town to see its places and what&apos;s on this week.
        </p>
      </section>

      {/* WHY IT EXISTS — the thesis */}
      <section
        className="rounded-[var(--app-radius-lg)] border p-5"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <h2
          className="font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Why a separate app for one county.
        </h2>
        <p
          className="mt-2 text-[14px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          Google Maps knows where Volt is. It doesn&apos;t know
          there&apos;s an Alive @ Five food-truck Friday on Carroll
          Creek, or that the brewery on a side street in Brunswick
          beats the one downtown. The county website lists meetings,
          not Saturday plans. We sit in the gap: a hyperlocal field
          guide tuned for one place, by people who live here.
        </p>
      </section>

      {/* WHAT WE PROMISE — the constraints that make it work */}
      <section className="space-y-3">
        <h2
          className="font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          What we promise.
        </h2>
        <ul className="space-y-3">
          {PROMISES.map((p) => (
            <li
              key={p.title}
              className="flex items-start gap-3 rounded-[var(--app-radius-md)] border p-4"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-bg-elevated)",
              }}
            >
              <span
                className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
                style={{
                  background:
                    "color-mix(in srgb, var(--app-positive) 16%, transparent)",
                  color: "var(--app-positive)",
                }}
                aria-hidden
              >
                <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[14px] font-semibold"
                  style={{ color: "var(--app-ink)" }}
                >
                  {p.title}
                </p>
                <p
                  className="mt-0.5 text-[13px] leading-relaxed"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {p.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* WHAT WE DO NOT DO — equally important */}
      <section className="space-y-3">
        <h2
          className="font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          What we don&apos;t do.
        </h2>
        <ul className="space-y-2.5">
          {DONT_DOS.map((d) => (
            <li
              key={d}
              className="flex items-start gap-3 text-[13.5px] leading-relaxed"
              style={{ color: "var(--app-ink-2)" }}
            >
              <CircleDot
                className="mt-1 h-3 w-3 shrink-0"
                strokeWidth={2.25}
                aria-hidden
                style={{ color: "var(--app-ink-3)" }}
              />
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* OWNER INVITE — the moat, soft pitch */}
      <section
        className="rounded-[var(--app-radius-lg)] border-l-4 p-5"
        style={{
          borderColor: "var(--app-brand)",
          background:
            "color-mix(in srgb, var(--app-brand) 4%, var(--app-bg-elevated))",
        }}
      >
        <p
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"
          style={{ color: "var(--app-brand)" }}
        >
          <Store className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          For local businesses
        </p>
        <h2
          className="mt-2 font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Own a place here? Claim it.
        </h2>
        <p
          className="mt-2 text-[14px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          Claimed listings can post specials and events. Customers who
          tap &ldquo;Follow&rdquo; on your page get a quiet ping when you do.
          It&apos;s the closest thing to a free, no-ads-no-spam channel
          to your local regulars.
        </p>
        <Link
          href="/business/claim"
          className="tactile tactile-interactive mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold"
          style={{ background: "var(--app-brand)", color: "white" }}
        >
          Claim your listing
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        </Link>
      </section>

      <p
        className="pt-2 text-center text-[11px]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Built by MAD Productions, in Frederick.
      </p>
    </div>
  );
}

const PROMISES: Array<{ title: string; detail: string }> = [
  {
    title: "Nothing is fabricated.",
    detail:
      "If we don't have hours, we say so. If a rating is missing, we don't invent one. Every external feed is gated. When a source fails, the row shows as honest empty, never as fake data.",
  },
  {
    title: "Verified freshness on every card.",
    detail:
      "A small chip on every place tells you when the data was last confirmed. \"Verified 3 days ago\" reads differently than \"Last verified March\", and we tell you both.",
  },
  {
    title: "Local, not national.",
    detail:
      "Our 1,700+ places are Frederick County only. Our event feeds come from Downtown Frederick Partnership, Celebrate Frederick, Hood College, and the county calendar. The people who actually run things here.",
  },
  {
    title: "Quiet by default.",
    detail:
      "No marketing notifications. No growth nags. Push notifications only fire for civic alerts you opt into and businesses you've chosen to follow. One tap to turn any of it off.",
  },
  {
    title: "Honest about closures.",
    detail:
      "Closed permanently means hidden. Temporarily closed means clearly labeled. We'd rather show fewer places than send you to a locked door.",
  },
];

const DONT_DOS: string[] = [
  "We don't sell ads, and we won't.",
  "We don't track you across other sites. Analytics are aggregate-only, no third-party pixels.",
  "We don't auto-fill restaurant copy from a scraping engine. If the description isn't ours or doesn't pass our quality bar, we show the category instead.",
  "We don't push tonight's specials at every business. Only at the ones owners have claimed and verified.",
  "We don't compete on coverage with Google Maps. We compete on knowing this place.",
];
