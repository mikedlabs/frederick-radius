import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, ChevronDown, Clock, Info, MapPin, Palette, SquareParking, Ticket, Waves } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { normalizeBrowseReturnTo } from "@/lib/browse-return";
import type { GuideAction, GuideStop, LocalOutingGuide as Guide } from "@/lib/today/local-outing-guides";
import styles from "./LocalOutingGuide.module.css";

const STOP_ICONS = { parking: SquareParking, info: Info, art: Palette, water: Waves };

function GuideLink({ action, context, primary }: { action: GuideAction; context?: string; primary?: boolean }) {
  const Arrow = action.href.startsWith("/") ? ArrowRight : ArrowUpRight;
  return (
    <Button
      href={action.href}
      variant={primary ? "primary" : "secondary"}
      aria-label={context ? `${action.label} for ${context}` : undefined}
      iconRight={<Arrow aria-hidden="true" size={16} className="shrink-0" />}
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

function OutingStop({ stop, primary }: { stop: GuideStop; primary: boolean }) {
  const Marker = stop.icon ? STOP_ICONS[stop.icon] : CalendarDays;
  return (
    <li id={stop.anchor} className={styles.stop} data-photo={stop.photo ? "" : undefined}>
      {stop.photo && <StopPicture photo={stop.photo} />}
      <div className={styles.stopBody}>
        <div className={styles.stopHeading}>
          {!stop.photo && <Marker size={24} aria-hidden="true" className={styles.stopMarker} />}
          <h2 className={styles.stopTitle}>{stop.title}</h2>
        </div>
        <div className={styles.facts}>
          <p><Clock size={16} aria-hidden="true" /><span>{stop.when}</span></p>
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

export default function LocalOutingGuide({
  guide,
  returnTo,
}: {
  guide: Guide;
  returnTo?: string | string[];
}) {
  const origin = normalizeBrowseReturnTo(returnTo);
  const todayHref = origin?.split(/[?#]/, 1)[0] === "/today" ? origin : "/today";
  const { photo } = guide;

  return (
    <article className={styles.guide}>
      <Link href={todayHref} className={styles.back}>
        <ArrowLeft aria-hidden="true" size={16} /> Back to Today
      </Link>

      <header className={styles.masthead}>
        <div className={styles.intro}>
          <p className={styles.scope}>{guide.scopeLabel}</p>
          <h1 className={styles.title}>{guide.title}</h1>
          {guide.summary && <p className={styles.summary}>{guide.summary}</p>}
          {guide.notice && (
            <aside aria-label={guide.notice.heading} className={styles.notice}>
              <p className={styles.noticeHeading}><CalendarDays size={16} aria-hidden="true" />{guide.notice.heading}</p>
              <p>{guide.notice.text}</p>
              <a className={styles.noticeLink} href={guide.notice.action.href}>{guide.notice.action.label} <ArrowRight aria-hidden="true" size={16} /></a>
            </aside>
          )}
        </div>
        <figure className={styles.figure}>
          <Image
            src={photo.src}
            alt={photo.alt}
            width={photo.width}
            height={photo.height}
            sizes="(min-width: 800px) 60vw, calc(100vw - 32px)"
            fetchPriority="high"
            loading="eager"
            className={styles.photo}
            style={{ objectPosition: photo.objectPosition }}
          />
          <figcaption className={styles.caption}>{guide.photoCaption}</figcaption>
        </figure>
      </header>

      <ol role="list" className={styles.stops}>
        {guide.stops.map((stop, index) => (
          <OutingStop key={`${stop.title}:${stop.action.href}`} stop={stop} primary={index === 0} />
        ))}
      </ol>

      {(guide.note || guide.secondaryAction) && (
        <footer className={styles.footer}>
          {guide.note && (
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
