import Image from "next/image";
import { ArrowRight, ArrowUpRight, Clock3, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { scopeToParam, type Scope } from "@/lib/scope";
import type {
  TonightIntent,
  TonightPick,
  TonightPreviewData,
} from "@/lib/today/tonight-preview";
import styles from "./TonightExperience.module.css";

export type TonightExperienceProps = {
  data: TonightPreviewData;
  /** Server-rendered conditions stay near the top without another data fetch. */
  weather?: ReactNode;
  alerts?: ReactNode;
};

const INTENTS: ReadonlyArray<{ intent: TonightIntent; label: string }> = [
  { intent: "dinner", label: "Find dinner" },
  { intent: "drinks", label: "Get a drink" },
  { intent: "pizza", label: "Find pizza" },
];

function intentHref(intent: TonightIntent, scope: Scope): string {
  const params = new URLSearchParams({ intent, in: scopeToParam(scope) });
  return `/today/tonight?${params.toString()}`;
}

function Availability({ pick }: { pick: TonightPick }) {
  return (
    <div className={styles.availability}>
      <p className={styles.availabilityLabel}>
        <Clock3 size={15} strokeWidth={1.8} aria-hidden="true" />
        <span>{pick.availabilityLabel}</span>
      </p>
      <p className={styles.hours}>{pick.hoursLabel}</p>
    </div>
  );
}

function Alternative({ pick }: { pick: TonightPick }) {
  return (
    <li className={styles.alternative}>
      <a
        href={pick.detailHref}
        className={styles.alternativeLink}
        aria-labelledby={`tonight-alternative-${pick.slug}`}
      >
        <p className={styles.placeMeta}>
          {pick.categoryLabel} <span aria-hidden="true">·</span> {pick.town}
        </p>
        <div className={styles.alternativeHeading}>
          <h3 id={`tonight-alternative-${pick.slug}`}>{pick.name}</h3>
          <ArrowUpRight size={20} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <p className={styles.alternativeWhy}>{pick.why}</p>
        <Availability pick={pick} />
        <p className={styles.source}>{pick.sourceLabel}</p>
        <span className={styles.quietAction}>
          View details <ArrowRight size={14} aria-hidden="true" />
        </span>
      </a>
    </li>
  );
}

/** One catalog-backed decision journey. Scope belongs to the shared header;
 * every recommendation opens the existing canonical place detail surface. */
export default function TonightExperience({
  data,
  weather,
  alerts,
}: TonightExperienceProps) {
  const [lead, ...alternatives] = data.picks;
  const showFrederickPhoto = !data.town || data.town === "frederick";

  return (
    <section className={styles.experience} aria-labelledby="tonight-title" data-tonight-experience>
      <header className={styles.header}>
        <div className={styles.dateline}>
          <p>{data.date}</p>
          <p>{data.windowLabel}</p>
        </div>
        <div className={styles.headingCopy}>
          <h1 id="tonight-title" className={styles.title}>{data.title}</h1>
          <p className={styles.scope}>
            <MapPin size={14} strokeWidth={1.8} aria-hidden="true" />
            {data.scopeLabel}
          </p>
        </div>
        {lead && showFrederickPhoto ? (
          <figure className={styles.localPhoto} data-tonight-area-photo>
            <div className={styles.photoFrame}>
              <Image
                src="/images/seasons/summer/SUMMER CARROL CREEK.jpg"
                alt="Carroll Creek in Frederick."
                fill
                loading="eager"
                sizes="(min-width: 768px) 240px, (max-width: 359px) 104px, 128px"
                className={styles.photo}
              />
            </div>
          </figure>
        ) : null}
        {data.scopeNote ? <p className={styles.introduction}>{data.scopeNote}</p> : null}
      </header>

      {weather || alerts ? (
        <div className={styles.context}>
          {weather ? <div className={styles.weather} data-tonight-weather>{weather}</div> : null}
          {alerts ? <div className={styles.alerts} data-tonight-alerts>{alerts}</div> : null}
        </div>
      ) : null}

      <nav className={styles.intents} aria-label="Choose your evening">
        {INTENTS.map(({ intent, label }) => (
          <a
            key={intent}
            href={intentHref(intent, data.scope)}
            aria-current={data.intent === intent ? "page" : undefined}
            className={styles.intent}
          >
            {label}
          </a>
        ))}
      </nav>

      {lead ? (
        <>
          <section className={styles.leadLayout} aria-labelledby="tonight-lead-name">
            <article className={styles.lead} data-tonight-lead>
              <p className={styles.eyebrow}>Start here</p>
              <p className={styles.placeMeta}>
                {lead.categoryLabel} <span aria-hidden="true">·</span> {lead.town}
              </p>
              <h2 id="tonight-lead-name" className={styles.leadName}>{lead.name}</h2>
              <p className={styles.address}>{lead.address}</p>
              <p className={styles.why}>{lead.why}</p>
              <Availability pick={lead} />
              <Button
                href={lead.detailHref}
                size="lg"
                className={styles.primaryAction}
                aria-label={`View ${lead.name} details`}
                iconRight={<ArrowRight size={17} strokeWidth={1.9} aria-hidden="true" />}
              >
                View place details
              </Button>
              <p className={styles.source}>{lead.sourceLabel}</p>
            </article>
          </section>

          {alternatives.length > 0 ? (
            <section className={styles.alternativesSection} aria-labelledby="tonight-alternatives-title">
              <h2 id="tonight-alternatives-title" className={styles.alternativesTitle}>Other places to consider</h2>
              <ul className={styles.alternatives}>
                {alternatives.slice(0, 2).map((pick) => <Alternative key={pick.slug} pick={pick} />)}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={MapPin}
          title="No matching places are listed for this area."
          body="Try another choice above, or change the area in the location control."
          className={styles.empty}
        />
      )}
    </section>
  );
}
