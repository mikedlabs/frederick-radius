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
import { loadSportsPageData } from "@/lib/loaders/sportsPage";
import { clientPlaces } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
import { CRAVING_BY_KEY, matchesCraving } from "@/data/cravings";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { SPORTS_TEAM_IDENTITIES, sportsTeamStyle } from "@/lib/sports/team-identity";
import styles from "@/components/sports/SportsIdentity.module.css";

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
  { id: "hood", level: "NCAA Division III · Frederick", href: "https://hoodathletics.com/calendar" },
  { id: "mount", level: "NCAA Division I · Emmitsburg", href: "https://mountathletics.com/calendar" },
  { id: "fcc", level: "NJCAA · Frederick", href: "https://www.fccathletics.com/composite" },
] as const;

const FCPS_TEAMS = [
  { name: "Brunswick Railroaders", href: "https://bhs.sites.fcps.org/extracurricular/athletics" },
  { name: "Catoctin Cougars", href: "https://chs.sites.fcps.org/parents_students/extracurricular_activities/athletics" },
  { name: "Frederick Cadets", href: "https://fhs.sites.fcps.org/athletics" },
  { name: "Gov. Thomas Johnson Patriots", href: "https://gtjhs.sites.fcps.org/parents_students/athletics" },
  { name: "Linganore Lancers", href: "https://lhs.sites.fcps.org/extracurricular/athletics" },
  { name: "Middletown Knights", href: "https://mhs.sites.fcps.org/extracurricular/athletics" },
  { name: "Oakdale Bears", href: "https://ohs.sites.fcps.org/parents_students/extracurricular/athletics" },
  { name: "Tuscarora Titans", href: "https://ths.sites.fcps.org/parents_students/athletics" },
  { name: "Urbana Hawks", href: "https://uhs.sites.fcps.org/parents_students/extracurricular_activities/athletics" },
  { name: "Walkersville Lions", href: "https://whs.sites.fcps.org/parents_students/w_h_s_athletics" },
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
  // One bounded assembly, shared by both event sections' Suspense boundaries.
  // The loaders already cap their individual providers; this page boundary is
  // the final guarantee that an ISR refresh cannot consume the 300s runtime.
  const { eventsPromise, localSportsPromise } = loadSportsPageData(now);

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
    <div className={`${styles.page} space-y-10 pb-4 sm:space-y-12`}>
      <header className={styles.hero}>
        <Image
          src="/images/seasons/spring/aerial-view-baseball-field.jpg"
          alt="An aerial view of McCurdy Field and the surrounding Frederick neighborhood"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 960px"
          className={styles.heroPhoto}
        />
        <div className={styles.heroShade} />
        <div className={styles.heroCopy}>
          <p>Frederick County sports</p>
          <h1>Frederick plays here.</h1>
          <p>Follow local teams from the Keys to Friday-night high school games, or find a place to play.</p>
          <div className={styles.heroActions}>
            <Link
              href="#sports-schedule"
              className={styles.heroPrimary}
            >
              See upcoming games
            </Link>
            <Link
              href="#sports-play"
              className={styles.heroSecondary}
            >
              Find a place to play
            </Link>
          </div>
        </div>
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
        <div className={styles.teamHeading} style={sportsTeamStyle("keys")} data-sports-team="keys">
          <span className={styles.teamMonogram} data-sports-team-accent aria-hidden>{SPORTS_TEAM_IDENTITIES.keys.monogram}</span>
          <div className="min-w-0">
            <h2>The Frederick Keys</h2>
            <p>Baseball · Nymeo Field</p>
          </div>
        </div>
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
          className={styles.cowsCard}
          style={sportsTeamStyle("cows")}
          data-sports-team="cows"
        >
          <div className={styles.cowsMasthead} aria-hidden>
            <span className={styles.teamMonogram}>FC</span>
            <div>
              <p>Frederick</p>
              <strong data-sports-team-accent>FLYING COWS</strong>
              <p>Professional basketball</p>
            </div>
          </div>
          <div className="grid gap-0 sm:grid-cols-[minmax(0,1.3fr)_minmax(15rem,.7fr)]">
            <div className="p-4 sm:p-5">
              <p
                className={styles.cowsKicker}
              >
                Professional basketball in Frederick
              </p>
              <h3
                className={styles.cowsBodyTitle}
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
                  className={styles.teamAction}
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

        <div className={`${styles.campusGrid} mt-4`}>
          {COLLEGE_TEAMS.map((college) => {
            const team = SPORTS_TEAM_IDENTITIES[college.id];
            return (
              <a
                key={college.id}
                href={college.href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.campusCard}
                style={sportsTeamStyle(college.id)}
                data-sports-team={college.id}
                aria-label={`${team.name} ${team.nickname} official athletics calendar`}
              >
                <span className={styles.teamMonogram} data-sports-team-accent aria-hidden>{team.monogram}</span>
                <span className={styles.campusCopy}>
                  <span className={styles.campusSchool}>{team.name}</span>
                  <strong className={styles.campusName}>{team.nickname}</strong>
                  <small className={styles.campusLevel}>{college.level}</small>
                </span>
                <ArrowUpRight className={styles.campusArrow} strokeWidth={2} aria-hidden />
              </a>
            );
          })}
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
              {FCPS_TEAMS.map((team) => (
                <a key={team.name} href={team.href} target="_blank" rel="noopener noreferrer" className={styles.schoolLink}>
                  {team.name}
                  <ArrowUpRight aria-hidden />
                </a>
              ))}
            </div>
            <a href={FCPS_ATHLETICS} target="_blank" rel="noopener noreferrer" className={`sports-school-official ${styles.schoolOfficial}`}>
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
