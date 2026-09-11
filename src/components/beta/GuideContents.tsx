import Image from "next/image";
import CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import { MUNICIPALITIES } from "@/data/municipalities";
import { BREWERIES } from "@/data/beers";
import { TABS } from "@/components/nav/tabs";
import { aerialCount, stripFrames } from "@/lib/beta-flight";
import { getBetaPulse, type BetaPulse } from "@/lib/loaders/betaPulse";
import { formatEasternClock } from "@/lib/format/easternClock";

/**
 * GuideContents — the "In the guide" section of /beta: the guide's own
 * table of contents, rendered LIVE. Each row is a real chapter of the
 * app (places, events, the map, beer, music, the aerial archive), set
 * in the app's own list language — serif heads, hairline rules,
 * right-aligned mono figures — with every number computed on this
 * request. The section is the answer to the owner's core complaint
 * (2026-07-19: "the beta doesnt explain what frederick radius is"):
 * a stranger reads what is inside and watches it count itself.
 *
 * Two-export pattern so the gate never waits on feeds: the page mounts
 * GuideContentsLive inside Suspense with a `pending` GuideContents as
 * the fallback — static figures paint instantly, live slots fill in.
 * Honesty rules: a live figure that cannot resolve is OMITTED, never
 * faked; the only hardcoded numbers on the page are zero.
 */

const PLACES_COUNT = (CLIENT_RAW as { places?: unknown[] }).places?.length ?? (CLIENT_RAW as unknown[]).length ?? 0;

/** "7pm" / "6:35pm" — Eastern, lowercase meridiem, minutes dropped at :00.
 *  Delegates to the shared formatter so event times and the /beta clock
 *  read identically. */
function formatEasternTime(iso: string): string {
  return formatEasternClock(new Date(iso));
}

/** "A and B" / "A, B, and C". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** The open-now prose for the Places row, per the copy branch table.
 *  Returned as parts (bold lead + plain rest) so the renderer never has
 *  to slice a sentence by string length. */
export function openNowLine(
  openNow: NonNullable<BetaPulse["openNow"]>,
): { lead: string; rest: string } | null {
  const { inventoryCount, worthConsidering, asOf } = openNow;
  if (inventoryCount <= 0) return null;
  const checkedAt = formatEasternTime(asOf);
  const inventorySentence =
    inventoryCount === 1
      ? `As of ${checkedAt}, recently checked posted hours confirm one county listing is open.`
      : `As of ${checkedAt}, recently checked posted hours confirm ${inventoryCount.toLocaleString()} county listings are open.`;
  if (worthConsidering.length === 0) {
    return {
      lead: "",
      rest: inventorySentence,
    };
  }
  const joined = joinNames(worthConsidering.map(({ name }) => name));
  return {
    lead: "Worth considering now:",
    rest: ` ${joined}. ${inventorySentence}`,
  };
}

/** The Keys sentence, per the copy branch table. Null renders nothing. */
export function keysLine(keys: NonNullable<BetaPulse["keys"]>): string {
  const opp = keys.opponent.name;
  const kr = keys.keys.runs;
  const or = keys.opponent.runs;
  if (keys.state === "live") {
    return kr != null && or != null
      ? `The Frederick Keys are on the field right now, ${kr} to ${or} against the ${opp}.`
      : `The Frederick Keys are on the field right now against the ${opp}.`;
  }
  if (keys.state === "pre") {
    const where = keys.keysHome ? "at Nymeo Field" : "on the road";
    const when = keys.startsAt ? ` today at ${formatEasternTime(keys.startsAt)}` : " today";
    return `The Frederick Keys play the ${opp} ${where}${when}.`;
  }
  if (keys.state === "final") {
    if (kr != null && or != null && kr > or) return `The Keys beat the ${opp}, ${kr} to ${or}.`;
    if (kr != null && or != null && kr < or) return `The Keys lost to the ${opp}, ${or} to ${kr}.`;
    return `The Keys finished their game against the ${opp} today.`;
  }
  if (keys.state === "postponed") return "Today's Keys game is postponed.";
  return "Today's Keys game is cancelled.";
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="flex items-baseline gap-2.5 text-[11px] font-bold uppercase tracking-[0.12em]"
      style={{ color: "var(--app-brand-press)" }}
    >
      <span aria-hidden className="block h-[3px] w-7 translate-y-[-2px] rounded-full" style={{ background: "var(--app-brand)" }} />
      {children}
    </h2>
  );
}

function MonoFigure({ children, dot }: { children: React.ReactNode; dot?: boolean }) {
  return (
    <p
      className="flex items-center justify-end gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] tabular-nums"
      style={{ color: "var(--app-ink-2)" }}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--app-positive)" }} />}
      {children}
    </p>
  );
}

function FigureSlot() {
  return (
    <span
      aria-hidden
      className="inline-block h-[14px] w-[6.5rem] rounded-[4px]"
      style={{ background: "var(--app-bg-sunken)" }}
    />
  );
}

function Row({
  title,
  description,
  figures,
  children,
}: {
  title: string;
  description: string;
  figures?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="border-t py-4" style={{ borderColor: "var(--app-border)" }}>
      <div className="flex justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-serif text-[19px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
            {title}
          </h3>
          <p className="mt-1 max-w-prose text-[13.5px] leading-[1.55] [text-wrap:pretty]" style={{ color: "var(--app-ink-2)" }}>
            {description}
          </p>
        </div>
        {figures && <div className="mt-[5px] min-w-[7.5rem] shrink-0 space-y-1.5 text-right">{figures}</div>}
      </div>
      {children}
    </li>
  );
}

export function GuideContents({
  pulse,
  pending = false,
  now,
}: {
  pulse: BetaPulse | null;
  pending?: boolean;
  now: Date;
}) {
  const photos = aerialCount();
  const strip = stripFrames(now);
  const openLine = pulse?.openNow ? openNowLine(pulse.openNow) : null;
  const showSmallChecks = Boolean(pulse && (pulse.keys || pulse.troutThisWeek));

  return (
    <section aria-labelledby="beta-contents-heading" className="mt-9">
      <div id="beta-contents-heading">
        <Eyebrow>In the guide</Eyebrow>
      </div>
      <ul className="mt-4 list-none">
        <Row
          title="Places, with checked hours"
          description="The guide covers restaurants, shops, trails, and parks. It says confirmed open only when recently checked posted hours support that claim."
          figures={
            <>
              <MonoFigure>{PLACES_COUNT.toLocaleString()} PLACES</MonoFigure>
              {pending ? (
                <FigureSlot />
              ) : pulse?.openNow && pulse.openNow.inventoryCount > 0 ? (
                <MonoFigure dot>
                  {pulse.openNow.inventoryCount.toLocaleString()} CONFIRMED OPEN
                </MonoFigure>
              ) : null}
            </>
          }
        >
          {openLine && (
            <p className="mt-1.5 text-[14.5px] leading-[1.6] tabular-nums" style={{ color: "var(--app-ink)" }}>
              {openLine.lead && <span className="font-semibold">{openLine.lead}</span>}
              {openLine.rest}
            </p>
          )}
        </Row>

        <Row
          title="Events, in one calendar"
          description="The guide keeps every public event in a single list, out of dozens of separate calendars."
          figures={
            pending ? (
              <FigureSlot />
            ) : pulse?.eventsToday && pulse.eventsToday > 0 ? (
              <MonoFigure>{pulse.eventsToday.toLocaleString()} TODAY</MonoFigure>
            ) : null
          }
        >
          {!pending && pulse?.eventsSample && pulse.eventsSample.length > 0 && (
            <ul className="mt-2 list-none">
              {pulse.eventsSample.map((e) => (
                <li key={`${e.title}-${e.startsAt}`} className="grid grid-cols-[3.25rem_1fr] gap-x-3 py-1">
                  <span className="font-mono text-[12px] font-semibold tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                    {formatEasternTime(e.startsAt)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium" style={{ color: "var(--app-ink)" }}>
                      {e.title}
                    </span>
                    {e.venue && (
                      <span className="block truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                        {e.venue}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Row>

        <Row
          title="The live map"
          description="TransIT buses, MARC trains, and the weather radar move on the map as they move outside."
          figures={<MonoFigure>{MUNICIPALITIES.length} TOWNS</MonoFigure>}
        />

        <Row
          title="The beer guide"
          description="The guide brings together Frederick County breweries, signature beers, posted hours, and source-backed taproom events."
          figures={<MonoFigure>{BREWERIES.length} BREWERIES</MonoFigure>}
        />

        <Row title="Live music" description="The guide tracks who is playing where, tonight and the weeks ahead." />

        <Row
          title="Frederick from above"
          description="Each drone photograph is pinned to the exact spot it was taken."
          figures={photos > 0 ? <MonoFigure>{photos} PHOTOS</MonoFigure> : undefined}
        >
          {strip.length >= 2 && (
            <figure className="mt-3">
              <div className="grid grid-cols-4 gap-2">
                {strip.map((src) => (
                  <div
                    key={src}
                    className="relative aspect-square overflow-hidden rounded-[var(--app-radius-sm)] border"
                    style={{ borderColor: "var(--app-border-strong)" }}
                  >
                    <Image src={src} alt="" fill loading="lazy" sizes="(min-width: 1024px) 8rem, 22vw" className="object-cover" />
                  </div>
                ))}
              </div>
              <figcaption className="mt-2 text-center font-serif text-[13px] italic" style={{ color: "var(--app-ink-2)" }}>
                More frames from the same archive.
              </figcaption>
            </figure>
          )}
        </Row>

        {showSmallChecks && (
          <Row
            title="The small checks"
            description="The scoreboard-sized facts a local keeps half an eye on."
            figures={
              pulse!.keys &&
              (pulse!.keys.state === "live" || pulse!.keys.state === "final") &&
              pulse!.keys.keys.runs != null &&
              pulse!.keys.opponent.runs != null ? (
                <MonoFigure>
                  KEYS {pulse!.keys.keys.runs}-{pulse!.keys.opponent.runs}
                </MonoFigure>
              ) : undefined
            }
          >
            <div className="mt-1.5 space-y-1 text-[14px] leading-[1.55]" style={{ color: "var(--app-ink-2)" }}>
              {pulse!.keys && <p>{keysLine(pulse!.keys)}</p>}
              {pulse!.troutThisWeek && <p>Local creeks got fresh trout from the state this week.</p>}
            </div>
          </Row>
        )}
      </ul>

      {/* the app's four tabs, as a quiet mono strip closing the list */}
      <div className="border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
        <p aria-hidden className="text-center font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
          {TABS.map((t) => t.label.toUpperCase()).join(" · ")}
        </p>
        <p className="sr-only">
          The app has {TABS.length} main tabs: {TABS.map((t) => t.label).join(", ")}.
        </p>
      </div>
    </section>
  );
}

/** The async half: fetches the pulse once and hands it to the layout. */
export async function GuideContentsLive({ now }: { now: Date }) {
  const pulse = await getBetaPulse(now);
  return <GuideContents pulse={pulse} now={now} />;
}
