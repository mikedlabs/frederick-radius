import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Activity, ArrowRight, ArrowUpRight, ChevronDown, Flag, MapPin, Radio, School, Waves } from "lucide-react";
import KeysScore from "@/components/today/KeysScore";
import KeysHomeGames, { KeysHomeGamesFallback } from "@/components/sports/KeysHomeGames";
import CountySportsEvents, { CountySportsEventsFallback } from "@/components/sports/CountySportsEvents";
import LocalSportsSchedule, { LocalSportsScheduleFallback } from "@/components/sports/LocalSportsSchedule";
import EventSheetBoundary from "@/components/event/EventSheetBoundary";
import SectionHeading from "@/components/ui/SectionHeading";
import PageChapter from "@/components/ui/PageChapter";
import { Row, RowList, IconTile } from "@/components/ui/Row";
import { PlaceMedallion } from "@/components/place/PlaceMedallion";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { getLocalSportsGames } from "@/lib/integrations/local-sports";
import { clientPlaces } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
import { CRAVING_BY_KEY, matchesCraving } from "@/data/cravings";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

export const metadata: Metadata = {
  title: "Sports",
  description:
    "Follow the Frederick Keys and Flying Cows, see sports events around the county, and find public places to play.",
  alternates: { canonical: "/sports" },
};

// 300s to match the unified event assembly's own cache window; the live Keys
// score stays current through its client island's 45s poll, not ISR.
export const revalidate = 300;

/** Courts and skateparks the catalog holds as their own place records. The
 *  bigger fields/courts inventory lives in the county GIS layers behind
 *  /parks; this list is only the standalone pages we can link directly. */
const COURTS_RE = /\b(pickleball|basketball|tennis|skate ?park|skatepark)\b/i;

const FLYING_COWS_SCHEDULE = "https://goflyingcows.com/2026-schedule/";
const FLYING_COWS_SITE = "https://goflyingcows.com/";

const COLLEGE_TEAMS = [
  {
    name: "Hood College",
    team: "Blazers",
    level: "NCAA Division III · Frederick",
    mark: "HC",
    href: "https://hoodathletics.com/calendar",
    tone: "plum",
  },
  {
    name: "Mount St. Mary's",
    team: "Mountaineers",
    level: "NCAA Division I · Emmitsburg",
    mark: "MSM",
    href: "https://mountathletics.com/calendar",
    tone: "blue",
  },
  {
    name: "Frederick Community College",
    team: "Cougars",
    level: "NJCAA · Frederick",
    mark: "FCC",
    href: "https://www.fccathletics.com/composite",
    tone: "green",
  },
] as const;

const FCPS_TEAMS = [
  "Brunswick Railroaders",
  "Catoctin Cougars",
  "Frederick Cadets",
  "Gov. Thomas Johnson Patriots",
  "Linganore Lancers",
  "Middletown Knights",
  "Oakdale Bears",
  "Tuscarora Titans",
  "Urbana Hawks",
  "Walkersville Lions",
] as const;

const FCPS_ATHLETICS = "https://www.fcps.org/athletics";
const FCPS_SCHEDULES = "https://www.arbiterlive.com/";
const FCPS_TICKETS = "https://gofan.co/";
const FCPS_STREAMS = "https://www.nfhsnetwork.com/";

const byName = (a: PlaceCardData, b: PlaceCardData) => a.name.localeCompare(b.name);

function townOf(p: PlaceCardData): string | undefined {
  return MUNICIPALITY_BY_SLUG[p.municipality]?.name ?? p.city ?? undefined;
}

export default function SportsPage() {
  const now = new Date();
  // ONE assembly, shared by both event sections' Suspense boundaries — the
  // same promise-sharing shape /today uses, so the feed work runs once.
  const eventsPromise = assembleUnifiedEvents(now);
  const localSportsPromise = getLocalSportsGames(now);

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
      <header className="sports-hero">
        <Image
          src="/images/seasons/spring/aerial-view-baseball-field.jpg"
          alt="An aerial view of McCurdy Field and the surrounding Frederick neighborhood"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 960px"
          className="sports-hero-photo object-cover object-center"
        />
        <div className="sports-hero-shade" />
        <div className="sports-hero-copy">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]">Frederick County sports</p>
          <h1>Frederick plays here.</h1>
          <p>Follow local teams from the Keys to Friday-night high school games, or find a place to play.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="#sports-schedule"
              className="tap-44 inline-flex min-h-11 items-center rounded-full border px-3 text-[12px] font-semibold"
              style={{ borderColor: "var(--app-on-brand)", color: "var(--app-ink)", background: "var(--app-on-brand)" }}
            >
              See upcoming games
            </Link>
            <Link
              href="#sports-play"
              className="tap-44 inline-flex min-h-11 items-center rounded-full border px-3 text-[12px] font-semibold"
              style={{
                borderColor: "color-mix(in srgb, var(--app-on-brand) 32%, transparent)",
                color: "var(--app-on-brand)",
                background: "color-mix(in srgb, var(--app-ink) 62%, transparent)",
              }}
            >
              Find a place to play
            </Link>
          </div>
        </div>
        <span className="sports-photo-credit">Original Frederick Radius photography</span>
      </header>

      <div id="sports-schedule" className="scroll-mt-24">
        <PageChapter
          label="On the schedule"
          index="01"
          tone="civic"
          bodyClassName="space-y-10 sm:space-y-12"
        >
        <section>
          <SectionHeading title="Upcoming team games" />
          <p
            className="mb-4 mt-2 max-w-[42rem] text-[12.5px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            Follow Hood, Mount St. Mary&apos;s, and FCC here. Open a game for its
            venue, live coverage, result, or verified source.
          </p>
          <Suspense fallback={<LocalSportsScheduleFallback />}>
            <LocalSportsSchedule gamesPromise={localSportsPromise} now={now} />
          </Suspense>
        </section>

        <section>
          <SectionHeading
            title="Games happening in Frederick"
            href="/events?intent=sports"
            cta="All sports events"
          />
          <EventSheetBoundary fetchMissing>
            <Suspense fallback={<CountySportsEventsFallback />}>
              <CountySportsEvents eventsPromise={eventsPromise} now={now} />
            </Suspense>
          </EventSheetBoundary>
        </section>
        </PageChapter>
      </div>

      {/* ── The Frederick Keys ─────────────────────────────────────────── */}
      <PageChapter
        label="Local teams"
        index="02"
        tone="brand"
        bodyClassName="space-y-10 sm:space-y-12"
      >
        <section>
        <SectionHeading title="The Frederick Keys" />
        {/* Live score on game days (home or away) — the client island
            self-hides on an idle day and polls only while a game is live. */}
        <div className="[&:not(:empty)]:mt-4">
          <KeysScore showMoreLink={false} />
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

      {/* ── Frederick Flying Cows ────────────────────────────────────── */}
        <section>
        <SectionHeading title="Frederick Flying Cows" />
        <div
          className="mt-4 overflow-hidden rounded-[var(--app-radius-lg)] border"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated)",
            boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
          }}
        >
          <div className="sports-cows-masthead" aria-hidden>
            <span>Frederick</span>
            <strong>FLYING COWS</strong>
            <span>Professional basketball</span>
          </div>
          <div className="grid gap-0 sm:grid-cols-[minmax(0,1.3fr)_minmax(15rem,.7fr)]">
            <div className="p-4 sm:p-5">
              <p
                className="font-mono text-[10px] font-bold uppercase tracking-[0.15em]"
                style={{ color: "var(--app-brand-press)" }}
              >
                Professional basketball in Frederick
              </p>
              <h3
                className="mt-2 font-serif text-[26px] font-semibold leading-tight tracking-tight"
                style={{ color: "var(--app-ink)" }}
              >
                The Cows play at Hood College.
              </h3>
              <p className="mt-2 max-w-[38rem] text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                The official season page separates home and away games, carries results, and links to full-game replays.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={FLYING_COWS_SCHEDULE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-44 inline-flex items-center gap-2 rounded-full px-3.5 text-[12px] font-semibold"
                  style={{ background: "var(--app-ink)", color: "var(--app-bg)" }}
                >
                  Schedule and results
                  <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                </a>
                <a
                  href={FLYING_COWS_SITE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-44 inline-flex items-center gap-2 rounded-full border px-3.5 text-[12px] font-semibold"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
                >
                  Team site
                  <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                </a>
              </div>
            </div>
            <dl className="grid grid-cols-2 border-t sm:grid-cols-1 sm:border-l sm:border-t-0" style={{ borderColor: "var(--app-border)" }}>
              <div className="p-4">
                <dt className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  Home court
                </dt>
                <dd className="mt-1 text-[12.5px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
                  Woodsboro Bank Arena
                </dd>
              </div>
              <div className="border-l p-4 sm:border-l-0 sm:border-t" style={{ borderColor: "var(--app-border)" }}>
                <dt className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
                  <Radio className="h-3.5 w-3.5" aria-hidden />
                  Watch
                </dt>
                <dd className="mt-1 text-[12.5px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
                  Free league streams and replays
                </dd>
              </div>
            </dl>
          </div>
        </div>
        </section>

      {/* ── College and high-school sports ─────────────────────────── */}
        <section>
        <SectionHeading title="College and high-school sports" />
        <p className="mt-2 max-w-[42rem] text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          The native schedule above carries college games. These official team
          pages remain available for late changes, rosters, and full-season records.
        </p>

        <div className="sports-campus-grid mt-4">
          {COLLEGE_TEAMS.map((college) => (
            <a
              key={college.name}
              href={college.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`sports-campus-card sports-campus-card--${college.tone}`}
              aria-label={`${college.name} ${college.team} official athletics calendar`}
            >
              <span className="sports-campus-mark" aria-hidden>{college.mark}</span>
              <span className="sports-campus-copy">
                <span>{college.name}</span>
                <strong>{college.team}</strong>
                <small>{college.level}</small>
              </span>
              <ArrowUpRight className="sports-campus-arrow" strokeWidth={2} aria-hidden />
            </a>
          ))}
        </div>

        <div className="sports-schools-panel mt-4">
          <div className="sports-schools-lead">
            <div className="sports-schools-icon" aria-hidden>
              <School className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em]">FCPS athletics</p>
              <h3>Ten schools. One place to start.</h3>
              <p>Use the county hub for official information, then open the live schedule, tickets, or stream.</p>
            </div>
          </div>

          <div className="sports-schools-actions">
            <a href={FCPS_SCHEDULES} target="_blank" rel="noopener noreferrer">
              Schedules <ArrowUpRight aria-hidden />
            </a>
            <a href={FCPS_TICKETS} target="_blank" rel="noopener noreferrer">
              Tickets <ArrowUpRight aria-hidden />
            </a>
            <a href={FCPS_STREAMS} target="_blank" rel="noopener noreferrer">
              Watch <ArrowUpRight aria-hidden />
            </a>
          </div>

          <details className="sports-school-list">
            <summary>
              <span>See all FCPS teams</span>
              <ChevronDown aria-hidden />
            </summary>
            <div className="sports-school-chips">
              {FCPS_TEAMS.map((team) => <span key={team}>{team}</span>)}
            </div>
            <a href={FCPS_ATHLETICS} target="_blank" rel="noopener noreferrer" className="sports-school-official">
              Open the official FCPS athletics hub
              <ArrowUpRight aria-hidden />
            </a>
          </details>
        </div>
        </section>
      </PageChapter>

      {/* ── Places to play ─────────────────────────────────────────────── */}
      <div id="sports-play" className="scroll-mt-24">
      <PageChapter label="Get on the field" index="03" tone="forest">
        <section className="space-y-6">
          <SectionHeading title="Places to play" />
          <p className="-mt-4 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Open a sport to see the full local list.
          </p>

        {golf.length > 0 && (
          <details className="sports-play-group overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]">
            <summary className="tap-44 flex cursor-pointer list-none items-center gap-3 p-3.5">
              <IconTile icon={Flag} tone="var(--app-brand-2)" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>Golf courses</span>
                <span className="block text-[11px]" style={{ color: "var(--app-ink-3)" }}>{golf.length} places around the county</span>
              </span>
              <ChevronDown className="h-4 w-4 transition-transform" style={{ color: "var(--app-ink-3)" }} aria-hidden />
            </summary>
            <div className="border-t p-2" style={{ borderColor: "var(--app-border)" }}>
              <RowList>
                {golf.map((p) => (
                  <Row
                    key={p.slug}
                    href={`/places/${p.slug}`}
                    leading={<PlaceMedallion place={p} />}
                    title={p.name}
                    subtitle={townOf(p)}
                  />
                ))}
              </RowList>
            </div>
          </details>
        )}

        {pools.length > 0 && (
          <details className="sports-play-group overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]">
            <summary className="tap-44 flex cursor-pointer list-none items-center gap-3 p-3.5">
              <IconTile icon={Waves} tone="var(--app-cool)" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>Pools and swimming</span>
                <span className="block text-[11px]" style={{ color: "var(--app-ink-3)" }}>{pools.length} public swimming places</span>
              </span>
              <ChevronDown className="h-4 w-4 transition-transform" style={{ color: "var(--app-ink-3)" }} aria-hidden />
            </summary>
            <div className="border-t p-2" style={{ borderColor: "var(--app-border)" }}>
              <RowList>
                {pools.map((p) => (
                  <Row
                    key={p.slug}
                    href={`/places/${p.slug}`}
                    leading={<PlaceMedallion place={p} />}
                    title={p.name}
                    subtitle={townOf(p)}
                  />
                ))}
              </RowList>
              <p className="px-2 pb-2 pt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                Outdoor pools keep seasonal hours, so check the posted schedule before a special trip.
              </p>
            </div>
          </details>
        )}

        {courts.length > 0 && (
          <details className="sports-play-group overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]">
            <summary className="tap-44 flex cursor-pointer list-none items-center gap-3 p-3.5">
              <IconTile icon={Activity} tone="var(--app-brand-2)" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>Courts and skateparks</span>
                <span className="block text-[11px]" style={{ color: "var(--app-ink-3)" }}>{courts.length} standalone places, plus county parks</span>
              </span>
              <ChevronDown className="h-4 w-4 transition-transform" style={{ color: "var(--app-ink-3)" }} aria-hidden />
            </summary>
            <div className="border-t p-2" style={{ borderColor: "var(--app-border)" }}>
              <RowList>
                {courts.map((p) => (
                  <Row
                    key={p.slug}
                    href={`/places/${p.slug}`}
                    leading={<PlaceMedallion place={p} />}
                    title={p.name}
                    subtitle={townOf(p)}
                  />
                ))}
              </RowList>
              <Link
                href="/parks"
                className="mt-1 inline-flex min-h-11 items-center gap-1.5 px-2 text-[11px] font-semibold"
                style={{ color: "var(--app-ink-2)" }}
              >
                Find more fields and courts in the parks directory
                <ArrowRight className="h-3 w-3" strokeWidth={2.4} aria-hidden />
              </Link>
            </div>
          </details>
        )}
        </section>
      </PageChapter>
      </div>
    </div>
  );
}
