import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Activity, ArrowRight, Flag, Waves } from "lucide-react";
import KeysScore from "@/components/today/KeysScore";
import KeysHomeGames, { KeysHomeGamesFallback } from "@/components/sports/KeysHomeGames";
import CountySportsEvents, { CountySportsEventsFallback } from "@/components/sports/CountySportsEvents";
import EventSheetBoundary from "@/components/event/EventSheetBoundary";
import SectionHeading from "@/components/ui/SectionHeading";
import { Row, RowList, IconTile } from "@/components/ui/Row";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { clientPlaces } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
import { CRAVING_BY_KEY, matchesCraving } from "@/data/cravings";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

export const metadata: Metadata = {
  title: "Sports",
  description:
    "Follow the Frederick Keys with tickets for the next home games, see sports events around the county, and find public places to play.",
  alternates: { canonical: "/sports" },
};

// 300s to match the unified event assembly's own cache window; the live Keys
// score stays current through its client island's 45s poll, not ISR.
export const revalidate = 300;

/** Courts and skateparks the catalog holds as their own place records. The
 *  bigger fields/courts inventory lives in the county GIS layers behind
 *  /parks; this list is only the standalone pages we can link directly. */
const COURTS_RE = /\b(pickleball|basketball|tennis|skate ?park|skatepark)\b/i;

const byName = (a: PlaceCardData, b: PlaceCardData) => a.name.localeCompare(b.name);

function townOf(p: PlaceCardData): string | undefined {
  return MUNICIPALITY_BY_SLUG[p.municipality]?.name ?? p.city ?? undefined;
}

/** Subhead for the Play groups — the SectionHeading `sm` register, kept h3 so
 *  the page outline stays h1 > h2 (sections) > h3 (place groups). */
function PlayGroupHeading({ title }: { title: string }) {
  return (
    <h3
      className="flex items-center gap-2 font-serif text-[16px] font-semibold leading-none tracking-tight"
      style={{ color: "var(--app-ink)" }}
    >
      <span
        aria-hidden
        className="inline-block h-3 w-1 rounded-full"
        style={{ background: "var(--section-accent, var(--app-brand))" }}
      />
      {title}
    </h3>
  );
}

export default function SportsPage() {
  const now = new Date();
  // ONE assembly, shared by both event sections' Suspense boundaries — the
  // same promise-sharing shape /today uses, so the feed work runs once.
  const eventsPromise = assembleUnifiedEvents(now);

  const places = clientPlaces();
  // The Play groups reuse the shipped craving matchers (the same sets the
  // Nearby "Golf" and "Pools" doors answer with), so the two surfaces can
  // never disagree about what counts.
  const golf = places.filter((p) => matchesCraving(CRAVING_BY_KEY.golf, p)).sort(byName);
  const pools = places.filter((p) => matchesCraving(CRAVING_BY_KEY.pools, p)).sort(byName);
  const courts = places
    .filter((p) => p.category === "park" && COURTS_RE.test(p.name))
    .sort(byName);

  return (
    <div className="space-y-10 pb-4 sm:space-y-12">
      <header>
        <p
          className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "var(--app-brand-press)" }}
        >
          Around the county
        </p>
        <h1
          className="mt-1 font-serif text-[34px] font-semibold leading-tight tracking-[-0.03em] sm:text-[40px]"
          style={{ color: "var(--app-ink)" }}
        >
          Sports
        </h1>
        <p
          className="mt-2 max-w-[40rem] text-[13.5px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Follow the Frederick Keys and see what else is on around the county.
          The bottom of the page lists public places where you can play.
        </p>
      </header>

      {/* ── The Frederick Keys ─────────────────────────────────────────── */}
      <section>
        <SectionHeading title="The Frederick Keys" />
        {/* Live score on game days (home or away) — the client island
            self-hides on an idle day and polls only while a game is live. */}
        <div className="[&:not(:empty)]:mt-4">
          <KeysScore />
        </div>
        <p
          className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Next home games · Nymeo Field
        </p>
        <EventSheetBoundary fetchMissing>
          <Suspense fallback={<KeysHomeGamesFallback />}>
            <KeysHomeGames eventsPromise={eventsPromise} now={now} />
          </Suspense>
        </EventSheetBoundary>
      </section>

      {/* ── Sports events beyond the Keys ──────────────────────────────── */}
      <section>
        <SectionHeading
          title="Around the county"
          href="/events?intent=sports"
          cta="See all sports events"
        />
        <EventSheetBoundary fetchMissing>
          <Suspense fallback={<CountySportsEventsFallback />}>
            <CountySportsEvents eventsPromise={eventsPromise} now={now} />
          </Suspense>
        </EventSheetBoundary>
      </section>

      {/* ── Places to play ─────────────────────────────────────────────── */}
      <section className="space-y-6">
        <SectionHeading title="Places to play" />

        {golf.length > 0 && (
          <div>
            <PlayGroupHeading title="Golf courses" />
            <RowList className="mt-2.5">
              {golf.map((p) => (
                <Row
                  key={p.slug}
                  href={`/places/${p.slug}`}
                  leading={<IconTile icon={Flag} tone="var(--app-brand-2)" />}
                  title={p.name}
                  subtitle={townOf(p)}
                />
              ))}
            </RowList>
          </div>
        )}

        {pools.length > 0 && (
          <div>
            <PlayGroupHeading title="Pools & swimming" />
            <RowList className="mt-2.5">
              {pools.map((p) => (
                <Row
                  key={p.slug}
                  href={`/places/${p.slug}`}
                  leading={<IconTile icon={Waves} tone="var(--app-cool)" />}
                  title={p.name}
                  subtitle={townOf(p)}
                />
              ))}
            </RowList>
            <p
              className="mt-2 text-[11.5px] leading-relaxed"
              style={{ color: "var(--app-ink-3)" }}
            >
              Outdoor pools keep seasonal hours, so check the posted schedule
              before a special trip.
            </p>
          </div>
        )}

        {courts.length > 0 && (
          <div>
            <PlayGroupHeading title="Courts & skateparks" />
            <RowList className="mt-2.5">
              {courts.map((p) => (
                <Row
                  key={p.slug}
                  href={`/places/${p.slug}`}
                  leading={<IconTile icon={Activity} tone="var(--app-brand-2)" />}
                  title={p.name}
                  subtitle={townOf(p)}
                />
              ))}
            </RowList>
            <div className="mt-1">
              <Link
                href="/parks"
                className="inline-flex min-h-11 items-center gap-1.5 text-[11px] font-semibold"
                style={{ color: "var(--app-ink-2)" }}
              >
                Find more fields and courts in the parks directory
                <ArrowRight className="h-3 w-3" strokeWidth={2.4} aria-hidden />
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
