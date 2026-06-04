import type { Metadata } from "next";
import Link from "next/link";
import { Database, CheckCircle2, Sparkles, Users, AlertCircle } from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import CostTransparency from "@/components/trust/CostTransparency";

/**
 * /trust — the plain-English explanation of where the data comes
 * from, what the trust badges mean, and what we deliberately don't
 * do. Linked from the SourceBadge tooltips and the FreshnessChip
 * tooltips so a stranger who sees "Curated" or "Confirmed 3 days
 * ago" can tap through and understand what the words actually mean.
 *
 * Sits inside the (app) route group so it carries the same chrome
 * as the rest of the app — feels like a settings page, not a legal
 * page. Deliberately short. If it's longer than what a person will
 * actually read on a phone, it's overbuilt.
 */

export const metadata: Metadata = {
  title: "Trust & data",
  description:
    "Where the data comes from, what the badges mean, and what we don't do.",
};

export default function TrustPage() {
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
          A short, honest page. What we know, what we don&apos;t,
          and how to tell the difference on every place card.
        </p>
      </header>

      {/* Where the data comes from */}
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
          The sources we pull from.
        </h2>
        <ul
          className="space-y-2.5 text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Our hand-picked set.</strong>{" "}
            1,700+ Frederick County places we vetted by hand. The Saturday-only
            bakery, the trail nobody talks about, the brewery that beats the
            one downtown.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Live event feeds.</strong>{" "}
            Downtown Frederick Partnership, Celebrate Frederick, Hood College,
            Frederick County government calendar. Pulled fresh, multiple times
            a day.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Owner-claimed listings.</strong>{" "}
            Businesses that have claimed their page and maintain their own
            hours, specials, and details.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>OpenStreetMap.</strong>{" "}
            Used only for amenities (restrooms, water fountains, EV charging,
            bike parking) where the public-utility data is reliable. Anything
            from OpenStreetMap is labeled as unverified.
          </li>
          <li>
            <strong style={{ color: "var(--app-ink)" }}>Resident submissions.</strong>{" "}
            People who notice we&apos;re missing something and send it via{" "}
            <Link
              href="/submit/place"
              className="underline"
              style={{ color: "var(--app-cool)" }}
            >
              /submit/place
            </Link>
            . Reviewed by hand before going live.
          </li>
        </ul>
      </section>

      {/* What the badges mean */}
      <section className="space-y-3">
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
          What &ldquo;Confirmed&rdquo; means.
        </h2>
        <p
          className="text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          A small chip on every place tells you when we last spot-checked
          the basics. &ldquo;Confirmed 3 days ago&rdquo; means recent. &ldquo;Last confirmed
          March 2025&rdquo; means stale, and we mark it that way. Confirmed is
          weaker than verified by design. We&apos;d rather under-claim than
          pretend.
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
          className="space-y-1.5 text-[13.5px] leading-relaxed pt-1"
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
        className="rounded-[var(--app-radius-lg)] border p-5"
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
          with what you saw and where. We read every message and fix
          things by hand.
        </p>
      </section>

      {/* What this thing actually costs to run. Civic credibility:
          a resident who reached /trust to figure out where the data
          comes from gets one more honest read here — "here's what
          keeps it online." */}
      <CostTransparency />

      <p
        className="pt-2 text-center text-[11px]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Made in Frederick, MD by Michael DeMattia, a downtown Frederick resident.
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
    label: "Hand-picked",
    color: "#A03A22",
    icon: Sparkles,
    body: "We picked this one ourselves. Vetted by hand, blurb written by a person, not auto-filled.",
  },
  {
    label: "Confirmed",
    color: "#1E6B3A",
    icon: CheckCircle2,
    body: "Operational and current — the basics (hours, category, rating) confirmed and enriched, with a confirmed-on date. This is NOT owner-managed; once a business claims its listing it earns the stronger “Verified”.",
  },
  {
    label: "Community",
    color: "#2F5470",
    icon: Users,
    body: "Submitted by a local or pulled from a public community feed. Reliable but not directly verified by us.",
  },
  {
    label: "Official",
    color: "#7E2C6F",
    icon: Database,
    body: "From an official county or government data feed. Refreshed on a schedule and never edited by us.",
  },
];
