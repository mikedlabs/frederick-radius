import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { socialFor, type SocialPlatform } from "@/data/social-sources";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Landmark,
  ShieldCheck,
  Sparkles,
  MapPin,
  CalendarPlus,
  Mail,
  Pencil,
  Scroll,
  type LucideIcon,
} from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import SeasonalPhoto from "@/components/ui/SeasonalPhoto";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

// Common requests — action-oriented intents for the curious reader.
// /about is meant to convert a stranger into a user; this grid gives
// them the six concrete next moves (submit, correct, write in) the
// pitch invites. Same shape as the /contacts + /parking grids.
type AboutIntent = {
  label: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
  href: string;
  external?: boolean;
};

const ABOUT_INTENTS: AboutIntent[] = [
  {
    label: "Submit a place",
    hint: "Send a place the guide has missed.",
    icon: MapPin,
    accent: "var(--app-brand)",
    href: "/submit/place",
  },
  {
    label: "Submit an event",
    hint: "Send an event with its date and official link.",
    icon: CalendarPlus,
    accent: "var(--app-accent)",
    href: "/submit/event",
  },
  {
    label: "Send a correction",
    hint: "Tell us when a listing is wrong or has closed.",
    icon: Pencil,
    accent: "var(--app-warning)",
    href: "mailto:hello@frederickradius.app?subject=Frederick%20Radius%20correction",
    external: true,
  },
  {
    label: "How we verify data",
    hint: "Read the sourcing and freshness rules behind the guide.",
    icon: ShieldCheck,
    accent: "var(--app-cool)",
    href: "/trust",
  },
  {
    label: "Email Radius",
    hint: "Ask about the project or a possible partnership.",
    icon: Mail,
    accent: "var(--app-cool)",
    href: "mailto:hello@frederickradius.app",
    external: true,
  },
  {
    label: "Frederick history",
    hint: "Read essays tied to the places that shaped Frederick.",
    icon: Scroll,
    accent: "var(--app-ink-2)",
    href: "/history",
  },
];

/**
 * /about — the 30-second pitch.
 *
 * Rewritten from a 342-line thesis essay (multiple sections, dashboard,
 * map embed, stat blocks) down to a four-paragraph pitch with a single
 * primary CTA. The job of this page is to convert a curious link-tapper
 * into a user, not to defend the product to itself.
 *
 * What this page is for:
 *   - A first-time stranger from a press link or share URL who needs
 *     to know what this is in 30 seconds.
 *   - A partner / funder who wants to confirm the bet is real before
 *     reading the data-trust commitments (linked at the bottom).
 *
 * What this page is NOT:
 *   - A magazine front. The other surfaces show the data; this one
 *     says why.
 *   - A dashboard. Live stats and embedded maps are noise here —
 *     they belong on the surfaces that actually do that job.
 *   - An onboarding sequence. /welcome handles persona-pick + cookie.
 */

export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  title: "About",
  description:
    "Frederick Radius helps people find places, local events, and practical information across Frederick County, Maryland.",
};

export default async function AboutPage() {
  return (
    // Widened from max-w-md (28rem) to a real reading column — was
    // rendering as a postcard in the middle of a desktop viewport.
    // Centered, capped at the same 768 the rest of the app uses.
    <div className="relative mx-auto w-full max-w-screen-md space-y-5 py-3 sm:space-y-7 sm:py-6">
      <PageBloom variant="warm-cool" />

      {/* Seasonal hero photograph — a real photo of Frederick from the
          owner's seasons collection, picked by current season with
          daily rotation. Frames "the pocket compass for Frederick
          County" line with a real sense of place before the pitch. */}
      <div
        className="relative aspect-[2/1] overflow-hidden rounded-[var(--app-radius-lg)] sm:aspect-[16/9]"
      >
        <SeasonalPhoto
          season="auto"
          alt="Frederick County"
          priority={true}
          sizes="(max-width: 768px) 100vw, 640px"
          className="absolute inset-0"
        />
        {/* Soft bottom gradient so the eyebrow + H1 below stay readable
            against a busy photo without darkening it heavily. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/3"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.18), transparent)",
          }}
        />
      </div>

      <header className="space-y-3">
        <p
          className="eyebrow"
          style={{ color: "var(--app-ink-3)" }}
        >
          About Frederick Radius
        </p>
        <h1
          className="font-serif text-[36px] font-semibold leading-[1.05] tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Frederick County, organized around{" "}
          <span style={{ color: "var(--app-brand)" }}>your day.</span>
        </h1>
      </header>

      {/* The first useful action stays with the promise instead of making a
          visitor read the whole origin story before they can try the app. */}
      <div>
        <Link
          href="/today"
          className="tactile tactile-lift tactile-glow-brand inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-3 text-[14px] font-semibold text-white"
          style={{ background: "var(--app-brand)" }}
        >
          See what&apos;s useful right now
          <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </Link>
      </div>

      {/* The pitch — four paragraphs, no more. Read top to bottom in
          about 30 seconds. Libre Caslon Display carries the editorial
          headings and Public Sans carries the body. */}
      <section className="space-y-4 text-[16px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        <p>
          Frederick Radius helps people find places, local events, and practical
          information across Frederick County, Maryland.
        </p>
        <p>
          It is built for the decisions that come up before you leave home.
          Radius combines source-backed place details with what is happening
          nearby and the practical information needed to get there.
        </p>
        <p>
          The goal is practical: help someone choose a place or event without
          sorting through several unrelated sites.
        </p>
        <p>
          Made in Frederick, MD by{" "}
          <span
            className="font-semibold"
            style={{ color: "var(--app-cool)" }}
          >
            Michael DeMattia
          </span>
          , a downtown Frederick resident.
        </p>
      </section>

      {/* Common requests — action tiles for the visitor who wants
          to participate. Submit a place, send a correction, email
          the editor. Sits between the pitch CTA and the editorial
          companion content (books, history) so the page reads as
          pitch → use → contribute → explore. */}
      <section
        aria-labelledby="about-intent-heading"
        className="space-y-2.5 pt-2"
      >
        <h2
          id="about-intent-heading"
          className="eyebrow px-1"
          style={{ color: "var(--app-ink-3)" }}
        >
          Common requests
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ABOUT_INTENTS.map((intent) => {
            const Icon = intent.icon;
            const isInternal = !intent.external && intent.href.startsWith("/");
            const Body = (
              <>
                <span
                  aria-hidden
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                  style={{
                    background: `color-mix(in srgb, ${intent.accent} 14%, transparent)`,
                  }}
                >
                  <Icon
                    className="h-4 w-4"
                    strokeWidth={2}
                    style={{ color: intent.accent }}
                  />
                </span>
                <span className="min-w-0">
                  <span
                    className="block text-[13px] font-semibold leading-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {intent.label}
                  </span>
                  <span
                    className="mt-0.5 block text-[11px] leading-snug"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {intent.hint}
                  </span>
                </span>
              </>
            );
            const className =
              "hover-lift flex h-full flex-col items-start gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition";
            const style = {
              borderColor: "var(--app-border)",
              boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
            };
            return (
              <li key={intent.label}>
                {isInternal ? (
                  <Link
                    href={intent.href}
                    aria-label={`${intent.label}: ${intent.hint}`}
                    className={className}
                    style={style}
                  >
                    {Body}
                  </Link>
                ) : (
                  <a
                    href={intent.href}
                    target={intent.external ? "_blank" : undefined}
                    rel={intent.external ? "noopener noreferrer" : undefined}
                    aria-label={`${intent.label}: ${intent.hint}`}
                    className={className}
                    style={style}
                  >
                    {Body}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-labelledby="about-trust-heading"
        className="flex items-start gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 sm:p-5"
        style={{ borderColor: "var(--app-border)" }}
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--app-cool) 14%, transparent)",
            color: "var(--app-cool)",
          }}
        >
          <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="about-trust-heading"
            className="font-sans text-[18px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            How Radius checks the guide
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            See which details come from official, owner, business, and community sources, plus what is currently unavailable.
          </p>
          <Link
            href="/trust"
            className="tap-44-y mt-2 inline-flex min-h-11 items-center font-semibold underline-offset-2 hover:underline"
            style={{ color: "var(--app-cool)" }}
          >
            Read Trust &amp; data
            <ArrowRight aria-hidden className="ml-1 h-3.5 w-3.5" strokeWidth={2.25} />
          </Link>
        </div>
      </section>

      {/* Companion content — Books + editorial collections + history.
          Moved here from the Field Guide drawer (May 2026 IA cleanup,
          Phase 2): the drawer was carrying four unrelated jobs;
          editorial / reading destinations don't belong in a launcher.
          /about is where someone learning about the project goes —
          the books, the longer essays, and the curated lists are
          natural neighbors. */}
      <section
        aria-labelledby="about-companion-heading"
        className="space-y-3 pt-2"
      >
        <h2
          id="about-companion-heading"
          className="font-sans text-[22px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Other Frederick projects
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* The book — From Above, the photographer's storefront. */}
          <li>
            <a
              href="https://www.miked.store"
              target="_blank"
              rel="noopener noreferrer"
              className="tactile tactile-interactive relative block aspect-[4/3] overflow-hidden rounded-[var(--app-radius-md)] border"
              style={{
                borderColor: "var(--app-border)",
                boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
              }}
              aria-label="From Above: drone photography over Frederick"
            >
              <Image
                src="/from-above/cover-front.webp"
                alt=""
                fill
                sizes="(max-width: 480px) 100vw, 360px"
                placeholder="blur"
                blurDataURL={PAPER_CREAM_BLUR}
                className="object-cover"
              />
              <span
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.28) 55%, transparent 90%)",
                }}
              />
              <span
                aria-hidden
                className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full"
                style={{
                  background: "rgba(255,255,255,0.88)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  boxShadow: "var(--app-shadow-1)",
                }}
              >
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} style={{ color: "var(--app-ink)" }} />
              </span>
              <span
                aria-hidden
                className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{
                  background: "rgba(255,255,255,0.88)",
                  color: "var(--app-ink)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <BookOpen className="h-3 w-3" strokeWidth={2.25} />
                Book
              </span>
              <span className="absolute inset-x-0 bottom-0 p-3">
                <span
                  className="block font-serif text-[15px] font-semibold leading-tight text-white"
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}
                >
                  From Above
                </span>
                <span
                  className="mt-0.5 block text-[11px] leading-snug text-white/85"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.55)" }}
                >
                  Drone photography over Frederick · miked.store
                </span>
              </span>
            </a>
          </li>

          {/* Color Frederick — the local coloring book. */}
          <li>
            <a
              href="https://www.colorfrederick.com"
              target="_blank"
              rel="noopener noreferrer"
              className="tactile tactile-interactive relative block aspect-[4/3] overflow-hidden rounded-[var(--app-radius-md)] border"
              style={{
                borderColor: "var(--app-border)",
                boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
              }}
              aria-label="Color Frederick: the Frederick coloring book"
            >
              <Image
                src="/images/color-frederick-cover.webp"
                alt=""
                fill
                sizes="(max-width: 480px) 100vw, 360px"
                placeholder="blur"
                blurDataURL={PAPER_CREAM_BLUR}
                className="object-cover"
              />
              <span
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.28) 55%, transparent 90%)",
                }}
              />
              <span
                aria-hidden
                className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full"
                style={{
                  background: "rgba(255,255,255,0.88)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  boxShadow: "var(--app-shadow-1)",
                }}
              >
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} style={{ color: "var(--app-ink)" }} />
              </span>
              <span
                aria-hidden
                className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{
                  background: "rgba(255,255,255,0.88)",
                  color: "var(--app-ink)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <BookOpen className="h-3 w-3" strokeWidth={2.25} />
                Book
              </span>
              <span className="absolute inset-x-0 bottom-0 p-3">
                <span
                  className="block font-serif text-[15px] font-semibold leading-tight text-white"
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}
                >
                  Color Frederick
                </span>
                <span
                  className="mt-0.5 block text-[11px] leading-snug text-white/85"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.55)" }}
                >
                  The Frederick coloring book · colorfrederick.com
                </span>
              </span>
            </a>
          </li>

          {/* History — editorial pages. */}
          <li>
            <Link
              href="/history"
              className="hover-lift flex h-full items-start gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3.5 transition"
              style={{
                borderColor: "var(--app-border)",
                boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
              }}
            >
              <span
                aria-hidden
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                style={{
                  background: "color-mix(in srgb, var(--app-brand-2) 14%, transparent)",
                  color: "var(--app-brand-2)",
                }}
              >
                <Landmark className="h-5 w-5" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[14px] font-semibold leading-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  History
                </span>
                <span
                  className="mt-0.5 block text-[12px] leading-snug"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Frederick County, one story at a time
                </span>
              </span>
            </Link>
          </li>

          {/* Collections — curated editorial lists. */}
          <li>
            <Link
              href="/collections"
              className="hover-lift flex h-full items-start gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3.5 transition"
              style={{
                borderColor: "var(--app-border)",
                boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
              }}
            >
              <span
                aria-hidden
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                style={{
                  background: "color-mix(in srgb, var(--app-accent) 14%, transparent)",
                  color: "var(--app-accent)",
                }}
              >
                <Sparkles className="h-5 w-5" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[14px] font-semibold leading-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  Collections
                </span>
                <span
                  className="mt-0.5 block text-[12px] leading-snug"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Editorial lists: date nights, rainy days, kid energy
                </span>
              </span>
            </Link>
          </li>
        </ul>
      </section>

      {/* Trust footer — the data-source commitments. The book +
          collections lived here in v1; they've moved up into the
          Companion content section above. */}
      <footer
        className="space-y-3 border-t pt-5 text-[13px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <p className="inline-flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-cool)" }} />
          <Link href="/trust" className="tap-44-y inline-flex items-center font-semibold underline-offset-2 hover:underline" style={{ color: "var(--app-cool)" }}>
            How Radius checks and sources listings <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
          </Link>
        </p>

        {/* Official government accounts (verified handles, so residents
            don't follow impersonators). */}
        <div className="space-y-1.5">
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>Official accounts</p>
          {(["county", "city"] as const).map((j) => {
            const accts = socialFor(j);
            if (accts.length === 0) return null;
            const platformLabel: Record<SocialPlatform, string> = { x: "X", instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", nextdoor: "Nextdoor" };
            return (
              <p key={j} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>
                  {j === "county" ? "Frederick County" : "City of Frederick"}
                </span>
                {accts.map((a) => (
                  <a
                    key={a.url}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-2 hover:underline"
                    style={{ color: "var(--app-cool)" }}
                  >
                    {platformLabel[a.platform]}
                  </a>
                ))}
              </p>
            );
          })}
        </div>
      </footer>
    </div>
  );
}
