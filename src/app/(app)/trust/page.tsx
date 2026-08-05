import type { Metadata } from "next";
import Link from "next/link";
import { Database, CheckCircle2, Sparkles, Users, AlertCircle } from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import CLIENT_PLACES from "@/data/places-client.json";
import CostTransparency from "@/components/trust/CostTransparency";
import { clientPlaces } from "@/lib/loaders/places-client";
import { summarizeCoverage } from "@/lib/quality/coverage";

/**
 * /trust — the plain-English explanation of where the data comes
 * from, what the trust badges mean, and what we deliberately don't
 * do. Linked from the SourceBadge tooltips and the FreshnessChip
 * explanations so a stranger who sees "Radius reviewed" or "Checked 3 days
 * ago" can tap through and understand what the words actually mean.
 *
 * Sits inside the (app) route group so it carries the same chrome
 * as the rest of the app — feels like a settings page, not a legal
 * page. Deliberately short. If it's longer than what a person will
 * actually read on a phone, it's overbuilt.
 */

export const metadata: Metadata = {
  alternates: { canonical: "/trust" },
  title: "Trust & data",
  description:
    "See where Frederick Radius data comes from and what its source labels mean.",
};

// The coverage numbers below use the wall clock (hours freshness decays), so
// a purely static render would slowly drift dishonest. Daily is fresh enough
// for figures that move by single places per day.
export const revalidate = 86_400;

const pct = (part: number, total: number): string =>
  total === 0 ? "0%" : `${Math.round((part / total) * 100)}%`;

export default function TrustPage() {
  const placeCount = new Intl.NumberFormat("en-US").format(CLIENT_PLACES.length);
  // The same measurements the internal coverage board runs — shown here so
  // this page proves its claims instead of asserting them. Aggregate only.
  const coverage = summarizeCoverage(clientPlaces());
  return (
    <div className="relative space-y-6">
      <PageBloom variant="cool" />

      <header className="space-y-2">
        <p
          className="eyebrow"
          style={{ color: "var(--app-ink-3)" }}
        >
          Trust &amp; data
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Where the data comes from.
        </h1>
        <p
          className="text-[16px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          This page explains the difference between checked source data and
          owner-supplied details.
        </p>
      </header>

      <nav aria-label="Trust page sections" className="-mx-1 flex flex-wrap gap-1.5 px-1">
        {[
          ["Sources", "#sources"],
          ["Badge meanings", "#badges"],
          ["Send a correction", "#corrections"],
        ].map(([label, href]) => (
          <a
            key={href}
            href={href}
            className="tap-44-y rounded-full border px-3 py-1.5 text-[12px] font-semibold"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
          >
            {label}
          </a>
        ))}
      </nav>

      {/* Where the data comes from */}
      <section
        id="sources"
        className="scroll-mt-24 rounded-[var(--app-radius-lg)] border p-5 space-y-3"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <h2
          className="font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          The sources we pull from.
        </h2>
        <ul
          className="space-y-2.5 text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          <li>
            <strong style={{ color: "var(--app-ink)" }}>The place index.</strong>{" "}
            {placeCount} records in the shipped place index, assembled from business,
            government, community, and mapping sources. Automated quality checks
            and review rules screen the index; we do not claim every listing was
            individually vetted by hand.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Event feeds.</strong>{" "}
            Downtown Frederick Partnership, Celebrate Frederick, Hood College,
            Frederick County government calendar, plus ticketed listings from
            Ticketmaster, Bandsintown, and the Weinberg Center. Radius checks
            these feeds multiple times a day.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Google Places.</strong>{" "}
            Adds business status, posted hours, phone numbers, ratings, and
            photos. A source match is labeled &ldquo;Checked at source&rdquo;; it is
            not the same thing as owner verification.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Owner-claimed listings.</strong>{" "}
            An &ldquo;Owner verified&rdquo; label is reserved for a business with an
            approved, active ownership claim. A claim does not make third-party
            ratings, reviews, or older details owner-supplied.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>OpenStreetMap.</strong>{" "}
            Used for amenities such as restrooms, water fountains, EV charging,
            and bike parking. It is community-maintained mapping data and is
            labeled by source; confirm anything important before relying on it.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Resident submissions.</strong>{" "}
            Residents can send a missing place through{" "}
            <Link
              href="/submit/place"
              className="underline"
              style={{ color: "var(--app-cool)" }}
            >
              /submit/place
            </Link>
            . Radius reviews each submission before publication.
          </li>
        </ul>
      </section>

      {/* What the badges mean */}
      <section id="badges" className="scroll-mt-24 space-y-3">
        <h2
          className="font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          What the badges mean.
        </h2>
        <ul className="space-y-3">
          {BADGES.map((b) => (
            <li
              key={b.label}
              className="flex items-start gap-3 rounded-[var(--app-radius-md)] border p-4"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-bg-elevated)",
              }}
            >
              <span
                className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
                style={{
                  background: `color-mix(in srgb, ${b.color} 14%, transparent)`,
                  color: b.color,
                }}
                aria-hidden
              >
                <b.icon className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[14px] font-semibold"
                  style={{ color: "var(--app-ink)" }}
                >
                  {b.label}
                </p>
                <p
                  className="mt-0.5 text-[13px] leading-relaxed"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {b.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Freshness */}
      <section
        className="rounded-[var(--app-radius-lg)] border p-5 space-y-3"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <h2
          className="font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          What &ldquo;Checked at source&rdquo; means.
        </h2>
        <p
          className="text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          A small chip records when Radius last checked available source details.
          &ldquo;Checked at source · 3d ago&rdquo; is recent, while &ldquo;Last checked Mar
          2025&rdquo; is stale. The chip does not mean the owner supplied or approved
          the listing. &ldquo;Owner verified&rdquo; is reserved for an approved active claim.
        </p>
      </section>

      {/* The measured state of the data — the same numbers the internal
          coverage board runs, so the page proves what it claims. Honest
          about gaps by construction: a low number renders as a low number. */}
      <section
        className="rounded-[var(--app-radius-lg)] border p-5 space-y-3"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <h2
          className="font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          The state of the data, measured.
        </h2>
        <ul
          className="space-y-2.5 text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Hours.</strong>{" "}
            {coverage.hours.toLocaleString("en-US")} of{" "}
            {coverage.total.toLocaleString("en-US")} places (
            {pct(coverage.hours, coverage.total)}) carry posted hours fresh
            enough for an open-now answer. Everywhere else the app says it does
            not know instead of guessing.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Photos.</strong>{" "}
            {coverage.photo.toLocaleString("en-US")} places (
            {pct(coverage.photo, coverage.total)}) carry a real photo from the
            venue or its source listing.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>A way to act.</strong>{" "}
            {coverage.action.toLocaleString("en-US")} places (
            {pct(coverage.action, coverage.total)}) carry a direct phone,
            website, menu, ordering, or reservation detail stored with the
            record.
          </li>
        </ul>
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
          These figures are measured from the shipped place index and refresh
          at least daily.
        </p>
      </section>

      {/* What we don't do */}
      <section
        className="rounded-[var(--app-radius-lg)] border-l-4 p-5 space-y-2"
        style={{
          borderColor: "var(--app-warning)",
          background:
            "color-mix(in srgb, var(--app-warning) 4%, var(--app-bg-elevated))",
        }}
      >
        <p
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"
          style={{ color: "var(--app-warning)" }}
        >
          <AlertCircle className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          What we don&apos;t do
        </p>
        <ul
          className="space-y-1.5 text-[14px] leading-relaxed pt-1"
          style={{ color: "var(--app-ink-2)" }}
        >
          <li>We don&apos;t invent hours when we don&apos;t know them.</li>
          <li>We don&apos;t show a rating we can&apos;t source.</li>
          <li>We don&apos;t auto-fill descriptions from a scraping engine.</li>
          <li>We don&apos;t accept paid placement.</li>
          <li>We don&apos;t pretend to be the county government.</li>
        </ul>
      </section>

      {/* Found something wrong */}
      <section
        id="corrections"
        className="scroll-mt-24 rounded-[var(--app-radius-lg)] border p-5"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <h2
          className="font-serif text-[18px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Find something wrong?
        </h2>
        <p
          className="mt-2 text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Email{" "}
          <a
            href="mailto:hello@frederickradius.app"
            className="underline"
            style={{ color: "var(--app-cool)" }}
          >
            hello@frederickradius.app
          </a>{" "}
          with what you saw and where. We review correction messages and update
          records by hand.
        </p>
      </section>

      {/* What it cost to build — the no-ads, no-investors civic read. */}
      <CostTransparency />

      <p
        className="pt-2 text-center text-[11px]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Frederick Radius is made locally in Frederick, Maryland, and is independent of local government.
      </p>
    </div>
  );
}

const BADGES: Array<{
  label: string;
  color: string;
  icon: typeof Sparkles;
  body: string;
}> = [
  {
    label: "Radius reviewed",
    color: "var(--app-brand-press)",
    icon: Sparkles,
    body: "Selected or edited in Frederick Radius. Current facts may still combine multiple sources and can change.",
  },
  {
    label: "Checked at source",
    color: "var(--app-positive)",
    icon: CheckCircle2,
    body: "Basic details were matched or checked against the named source, with a checked-on date where available. This is not owner verification.",
  },
  {
    label: "Owner verified",
    color: "var(--app-positive)",
    icon: CheckCircle2,
    body: "Reserved for a business with an approved, active ownership claim. It applies to owner-managed details, not third-party ratings or reviews.",
  },
  {
    label: "Community source",
    color: "var(--app-cool)",
    icon: Users,
    body: "Submitted by a local or assembled from a public community or mapping source. Check important details with the linked source.",
  },
  {
    label: "Official source",
    color: "var(--app-civic)",
    icon: Database,
    body: "Imported from a government source. Frederick Radius may normalize or summarize it. The source agency does not operate or endorse this app; check the linked source for the current official record.",
  },
];
