import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, ChevronDown, Clock, Info, MapPin, Navigation, Palette, SquareParking, Ticket, Waves } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { normalizeBrowseReturnTo } from "@/lib/browse-return";
import { routeTimePreview, type GuideAction, type GuideStop, type LocalOutingGuide as Guide } from "@/lib/today/local-outing-guides";
import RouteTimeStrip from "./RouteTimeStrip";
import WalkStopMap from "./WalkStopMap";
import EventTimeRail from "@/components/event/EventTimeRail";
import { buildDaySchedule } from "@/lib/events/day-schedule";
import { easternDayKey } from "@/lib/tz";
import styles from "./LocalOutingGuide.module.css";

const STOP_ICONS = { parking: SquareParking, info: Info, art: Palette, water: Waves };

function GuideLink({ action, context, primary }: { action: GuideAction; context?: string; primary?: boolean }) {
  const isDirections = primary && action.href.includes("travelmode=");
  const Arrow = action.href.startsWith("/") ? ArrowRight : ArrowUpRight;
  return (
    <Button
      href={action.href}
      variant={primary ? "primary" : "secondary"}
      aria-label={context ? `${action.label} for ${context}` : undefined}
      iconLeft={isDirections ? <Navigation aria-hidden="true" size={17} /> : undefined}
      iconRight={isDirections ? undefined : <Arrow aria-hidden="true" size={16} className="shrink-0" />}
      className={`${styles.action} h-auto min-h-11 whitespace-normal`}
    >
      {action.label}
    </Button>
  );
}

function StopPicture({ photo }: { photo: NonNullable<GuideStop["photo"]> }) {
  return (
    <figure className={styles.stopPicture}>
      <Image
        src={photo.src}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        sizes="(min-width: 800px) 360px, calc(100vw - 32px)"
        className={styles.stopPhoto}
        style={{ objectPosition: photo.objectPosition }}
      />
      <figcaption className={styles.credit}>
        <span>{photo.caption}</span>
        {photo.credit && (
          <div className={styles.creditLinks}>
            <a href={photo.credit.source_url} className={styles.sourceLink} aria-label={`Photo source, ${photo.credit.creator}`}>
              {photo.credit.creator}
            </a>
            <a href={photo.credit.license.url} className={styles.sourceLink}>{photo.credit.license.label}</a>
            {/* The change record stays in the data; the credit only says the file was edited. */}
            {photo.credit.edited && <span data-photo-credit-edited>edited</span>}
          </div>
        )}
      </figcaption>
    </figure>
  );
}

function OutingStop({ stop, primary, order, anchor = stop.anchor }: { stop: GuideStop; primary: boolean; order?: number; anchor?: string }) {
  const Marker = stop.icon ? STOP_ICONS[stop.icon] : CalendarDays;
  return (
    <li id={anchor} tabIndex={anchor ? -1 : undefined} className={styles.stop} data-photo={stop.photo ? "" : undefined}>
      {order && <span className={styles.stopNumber} aria-label={`Stop ${order}`}>{order}</span>}
      {stop.photo && <StopPicture photo={stop.photo} />}
      <div className={styles.stopBody}>
        <div className={styles.stopHeading}>
          {!stop.photo && !order && <Marker size={24} aria-hidden="true" className={styles.stopMarker} />}
          <h2 className={styles.stopTitle}>{stop.title}</h2>
        </div>
        {stop.suggestedMinutes && <p className={styles.visitLength}>Suggested visit · {stop.suggestedMinutes} minutes</p>}
        <div className={styles.facts}>
          <p><Clock size={16} aria-hidden="true" /><span>{order ? `Hours · ${stop.when}` : stop.when}</span></p>
          <p><MapPin size={16} aria-hidden="true" /><span>{stop.where}</span></p>
          {stop.price && <p><Ticket size={16} aria-hidden="true" /><span>{stop.price}</span></p>}
        </div>
        {stop.statusNote && <p className="mb-2 text-sm" style={{ color: "var(--app-ink-2)" }}>{stop.statusNote}</p>}
        <GuideLink action={stop.action} context={stop.title} primary={primary} />
        {stop.visitTip && <p className={styles.visitTip}>{stop.visitTip}</p>}
        <details className={styles.details}>
          <summary aria-label={`Details and source for ${stop.title}`}>
            Details and source <ChevronDown aria-hidden="true" size={16} />
          </summary>
          <div className={styles.detailBody}>
            <p>{stop.description}</p>
            {stop.detail && <p>{stop.detail}</p>}
            <div className={styles.creditLinks}>
              {stop.source.href === stop.action.href ? (
                <p className={styles.credit}>Source {stop.source.label}</p>
              ) : (
                <a
                  href={stop.source.href}
                  aria-label={`${stop.source.label}, source for ${stop.title}`}
                  className={styles.sourceLink}
                >
                  {stop.source.label}
                </a>
              )}
              {stop.tipSource && (
                <a href={stop.tipSource.href} className={styles.sourceLink}>{stop.tipSource.label}</a>
              )}
            </div>
          </div>
        </details>
      </div>
    </li>
  );
}

function GuideCover({ guide }: { guide: Guide }) {
  const { photo } = guide;
  return (
    <figure className={styles.figure}>
      <Image
        src={photo.src}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        sizes={guide.route ? "(min-width: 960px) 896px, calc(100vw - 32px)" : "(min-width: 800px) 52vw, calc(100vw - 32px)"}
        fetchPriority="high"
        loading="eager"
        className={styles.photo}
        style={photo.objectPosition ? { objectPosition: photo.objectPosition } : undefined}
      />
      <figcaption className={styles.caption}>
        <span>{guide.photoCaption}</span>
        {photo.credit && (
          <details className={styles.coverCredit}>
            <summary>{photo.credit.creator}{photo.credit.capturedYear && ` · ${photo.credit.capturedYear}`} <ChevronDown size={13} aria-hidden="true" /></summary>
            <div>
              <a className={styles.sourceLink} href={photo.credit.source_url}>Photo by {photo.credit.creator}</a>
              <a className={styles.sourceLink} href={photo.credit.license.url}>{photo.credit.license.label}</a>
              <p>{photo.credit.modifications}</p>
            </div>
          </details>
        )}
      </figcaption>
    </figure>
  );
}

function RouteOverview({ stops, allowanceMinutes, note }: { stops: GuideStop[]; allowanceMinutes: number; note?: string }) {
  return (
    <nav aria-label="Route overview" className={styles.overview}>
      <h2 className={styles.indexTitle}>Your route</h2>
      <WalkStopMap stops={stops} />
      <h3 className={styles.indexTitle}>Suggested time</h3>
      <RouteTimeStrip preview={routeTimePreview(stops, allowanceMinutes)} />
      {note && (
        <details className={styles.details}>
          <summary>Before you go <ChevronDown aria-hidden="true" size={16} /></summary>
          <div className={styles.detailBody}><p>{note}</p></div>
        </details>
      )}
    </nav>
  );
}

const weekendDay = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric" });

function WeekendSchedule({ stops }: { stops: GuideStop[] }) {
  const groups = new Map<string, { stop: GuideStop; timing: NonNullable<GuideStop["timing"]>; index: number }[]>();
  stops.forEach((stop, index) => {
    if (!stop.timing || !Number.isFinite(Date.parse(stop.timing.starts_at))) return;
    const day = easternDayKey(new Date(stop.timing.starts_at));
    const row = { stop, timing: stop.timing, index };
    const sameDay = groups.get(day);
    if (sameDay) sameDay.push(row);
    else groups.set(day, [row]);
  });
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([day, rows]) => {
    rows.sort((a, b) => Date.parse(a.timing.starts_at) - Date.parse(b.timing.starts_at));
    const marks = buildDaySchedule(rows.map(row => row.timing), day);
    if (marks.size < 2) return null;
    return <nav key={day} className={styles.weekendSchedule} aria-labelledby={`weekend-when-${day}`}>
      <h2 id={`weekend-when-${day}`}><time dateTime={day}>{weekendDay.format(new Date(rows[0].timing.starts_at))}</time></h2>
      <ol>{rows.map(({ stop, timing, index }) => {
        const mark = marks.get(timing);
        if (!mark) return null;
        const descriptionId = `weekend-time-${index}`;
        return <li key={index}>
          <a href={`#weekend-choice-${index + 1}`} aria-describedby={descriptionId}>
            <span className={styles.choiceIdentity}>{stop.title}</span>
            <EventTimeRail mark={mark} id={descriptionId} />
          </a>
        </li>;
      })}</ol>
    </nav>;
  });
}

function HolidayNotice({ notice }: { notice: NonNullable<Guide["notice"]> }) {
  const sources = (
    <div className={styles.creditLinks}>
      {notice.sources.map(source => <a key={source.href} href={source.href} className={styles.noticeLink}>{source.label}</a>)}
    </div>
  );
  return (
    <aside aria-label={notice.heading} className={styles.notice} data-active={notice.active || undefined}>
      {notice.active && <p className={styles.noticeHeading}><CalendarDays size={18} aria-hidden="true" />{notice.heading}</p>}
      {notice.active && <p>{notice.text}</p>}
      <details className={styles.details}>
        <summary>
          {!notice.active && <CalendarDays size={17} aria-hidden="true" />}
          {notice.active ? "Holiday hours and parking sources" : `${notice.heading} · Closures and parking`}
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div className={styles.noticeBody}>
          {!notice.active && <p>{notice.text}</p>}
          {sources}
        </div>
      </details>
    </aside>
  );
}

export default function LocalOutingGuide({
  guide,
  returnTo,
}: {
  guide: Guide;
  returnTo?: string | string[];
}) {
  const origin = normalizeBrowseReturnTo(returnTo);
  const todayHref = origin?.split(/[?#]/, 1)[0] === "/today" ? origin : "/today";
  return (
    <article className={styles.guide} data-walking={guide.route ? "" : undefined}>
      <Link href={todayHref} className={styles.back}>
        <ArrowLeft aria-hidden="true" size={16} /> Back to Today
      </Link>

      {guide.route ? (
        <>
          <GuideCover guide={guide} />
          <header className={styles.walkIntro}>
            <div className={styles.intro}>
              <p className={styles.scope}>{guide.scopeLabel}</p>
              <h1 className={styles.walkTitle}>{guide.title}</h1>
              <p className={styles.routeTime}><Clock size={17} aria-hidden="true" />{guide.route.durationLabel}</p>
              {guide.summary && <p className={styles.walkSummary}>{guide.summary}</p>}
              {guide.notice?.active && <HolidayNotice notice={guide.notice} />}
            </div>
            <div className={styles.walkActions}><GuideLink action={guide.route.firstAction} primary /></div>
            <RouteOverview stops={guide.stops} allowanceMinutes={guide.route.allowanceMinutes} note={guide.note} />
          </header>
        </>
      ) : (
        <header className={styles.masthead}>
          <div className={styles.intro}>
            <p className={styles.scope}>{guide.scopeLabel}</p>
            <h1 className={styles.title}>{guide.title}</h1>
            {guide.summary && <p className={styles.summary}>{guide.summary}</p>}
          </div>
          <GuideCover guide={guide} />
          {guide.stopLayout === "choices" && <WeekendSchedule stops={guide.stops} />}
        </header>
      )}

      {guide.notice && !guide.notice.active && <HolidayNotice notice={guide.notice} />}
      <ol role="list" aria-label={guide.route ? "Walking itinerary" : "Weekend guide picks"} className={styles.stops} data-layout={guide.route ? "route" : guide.stopLayout}>
        {guide.stops.map((stop, index) => (
          <OutingStop key={`${stop.title}:${stop.action.href}`} stop={stop} primary={!guide.route && index === 0} order={guide.route ? index + 1 : undefined}
            anchor={guide.stopLayout === "choices" ? `weekend-choice-${index + 1}` : stop.anchor} />
        ))}
      </ol>

      {((guide.note && !guide.route) || guide.secondaryAction) && (
        <footer className={styles.footer}>
          {guide.note && !guide.route && (
            <details className={styles.details}>
              <summary>Before you go <ChevronDown aria-hidden="true" size={16} /></summary>
              <div className={styles.detailBody}><p>{guide.note}</p></div>
            </details>
          )}
          {guide.secondaryAction && <GuideLink action={guide.secondaryAction} primary={!guide.stops.length} />}
        </footer>
      )}
    </article>
  );
}
