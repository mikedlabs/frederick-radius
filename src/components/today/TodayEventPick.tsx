/**
 * Compact / lead event card for Today's briefing.
 *
 * Lead (first pick): a real photograph when the source or linked place
 * provides one; otherwise a calm category-colored wash. Compact cards keep
 * the same facts in a denser row. Never uses stock or archive photography.
 */

import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { eventDateBlock } from "@/lib/events/format";
import { eventTown } from "@/lib/events/eventTown";
import { eventEndTrust, eventWithIsoInstants } from "@/lib/today/event-fields";
import {
  todayCategoryTextColor,
  todayEventSourceLabel,
  todayEventWhy,
} from "@/lib/today/event-copy";
import { todayEventVisual } from "@/lib/today/event-visual";
import type { EventWithMeta } from "@/lib/loaders/events";
import CategoryIcon from "@/components/place/CategoryIcon";
import EventVisualCredit from "@/components/event/EventVisualCredit";
import SaveButton from "@/components/saved/SaveButton";
import { Surface } from "@/components/ui/Surface";
import { isEventLiveNow } from "@/lib/eventWhenLabel";
import styles from "./TodayEventPick.module.css";

type TodayEventPickProps = {
  event: EventWithMeta;
  reason?: string | null;
  variant?: "lead" | "compact";
  now?: Date;
};

export default function TodayEventPick({
  event,
  reason,
  variant = "compact",
  now,
}: TodayEventPickProps) {
  const timed = eventWithIsoInstants(event);
  const time = eventDateBlock(timed).time;
  const town = eventTown(event);
  const venue = event.venue_name?.trim();
  const cat = CATEGORY_BY_SLUG[event.category ?? ""];
  const accent = cat?.color ?? "#7A7975";
  const accentText = todayCategoryTextColor(accent);
  const categoryLabel = cat?.name ?? "Event";
  const visual = todayEventVisual(event);
  const why = reason ?? todayEventWhy(event, now);
  const sourceLabel = todayEventSourceLabel(event);
  const where = [venue, town && town.toLowerCase() !== venue?.toLowerCase() ? town : null]
    .filter(Boolean)
    .join(" · ");
  const trust = eventEndTrust(event);
  const live = trust !== "untrusted" && Boolean(now) && isEventLiveNow(timed, now!);
  const isLead = variant === "lead";

  const media = visual ? (
    <Image
      src={visual.src}
      alt=""
      fill
      unoptimized={visual.src.startsWith("/api/place-photo")}
      sizes={isLead ? "(max-width: 640px) 100vw, 640px" : "72px"}
      placeholder="blur"
      blurDataURL={PAPER_CREAM_BLUR}
      className={styles.photo}
      priority={isLead}
    />
  ) : (
    <span className={styles.fallback} aria-hidden>
      <CategoryIcon
        slug={event.category ?? ""}
        className={styles.fallbackMark}
        strokeWidth={1.6}
      />
    </span>
  );

  return (
    <Surface
      as="article"
      variant="raised"
      padding="none"
      data-today-event-pick={variant}
      data-today-event-visual={visual ? "photo" : "category"}
      className={`${styles.card} ${isLead ? styles.lead : styles.compact}`}
      style={{
        "--accent": accent,
        "--fallback": `color-mix(in srgb, ${accent} 16%, var(--app-bg-sunken))`,
        boxShadow: `inset 3px 0 0 ${accent}, var(--app-edge)`,
      } as CSSProperties}
    >
      <div className={styles.frame}>
      <Link
        href={`/events/${event.slug}`}
        prefetch={false}
        className={styles.hit}
      >
        {isLead ? (
          <>
            <div className={styles.media}>{media}</div>
            <div className={styles.body}>
              <CardCopy
                accentText={accentText}
                categoryLabel={categoryLabel}
                live={live}
                time={time}
                title={event.title}
                where={where}
                why={why}
                sourceLabel={sourceLabel}
                lead
              />
            </div>
          </>
        ) : (
          <div className={styles.compactRow}>
            <div className={styles.thumb}>
              <div className={styles.thumbMedia}>{media}</div>
            </div>
            <div className="min-w-0 flex-1">
              <CardCopy
                accentText={accentText}
                categoryLabel={categoryLabel}
                live={live}
                time={time}
                title={event.title}
                where={where}
                why={why}
                sourceLabel={sourceLabel}
              />
            </div>
          </div>
        )}
      </Link>
      <span className={styles.save}>
        <SaveButton refType="event" refId={event.slug} label={`Save ${event.title}`} />
      </span>
      </div>
      {visual ? (
        <EventVisualCredit
          visual={visual}
          compact
          className={styles.credit}
        />
      ) : null}
    </Surface>
  );
}

function CardCopy({
  accentText,
  categoryLabel,
  live,
  time,
  title,
  where,
  why,
  sourceLabel,
  lead = false,
}: {
  accentText: string;
  categoryLabel: string;
  live: boolean;
  time: string;
  title: string;
  where: string;
  why: string | null;
  sourceLabel: string | null;
  lead?: boolean;
}) {
  return (
    <>
      <div className={styles.kicker}>
        <span className={styles.category} style={{ color: accentText }}>
          {categoryLabel}
        </span>
        <span className={styles.time}>
          {live ? "Happening now · " : null}
          {time}
        </span>
      </div>
      <h3 className={`${lead ? styles.titleLead : styles.title} line-clamp-2`}>
        {title}
      </h3>
      {where ? <p className={styles.where}>{where}</p> : null}
      {why ? <p className={styles.why}>{why}</p> : null}
      {sourceLabel ? <p className={styles.source}>{sourceLabel}</p> : null}
    </>
  );
}
