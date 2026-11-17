import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { normalizeBrowseReturnTo } from "@/lib/browse-return";
import type { GuideAction, LocalOutingGuide as Guide } from "@/lib/today/local-outing-guides";
import styles from "./LocalOutingGuide.module.css";

function GuideLink({ action, context }: { action: GuideAction; context?: string }) {
  const isLocal = action.href.startsWith("/");
  const Arrow = isLocal ? ArrowRight : ArrowUpRight;
  const content = <>{action.label}<Arrow aria-hidden="true" size={16} /></>;
  const label = context ? `${action.label} for ${context}` : undefined;
  return isLocal ? (
    <Link href={action.href} aria-label={label} className={styles.action}>
      {content}
    </Link>
  ) : (
    <a href={action.href} aria-label={label} className={styles.action}>
      {content}
    </a>
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
        <p className={styles.scope}>{guide.scopeLabel}</p>
        <h1 className={styles.title}>{guide.title}</h1>
        <p className={styles.summary}>{guide.summary}</p>
      </header>

      <figure className={styles.figure}>
        <Image
          src={photo.src}
          alt={photo.alt}
          width={photo.width}
          height={photo.height}
          sizes="(min-width: 840px) 800px, calc(100vw - 32px)"
          fetchPriority="high"
          loading="eager"
          className={styles.photo}
        />
        <figcaption className={styles.caption}>{guide.photoCaption}</figcaption>
      </figure>

      <ol role="list" className={styles.stops}>
        {guide.stops.map((stop) => (
          <li key={`${stop.title}:${stop.action.href}`} className={styles.stop}>
            <div className={styles.stopHeader}>
              <p className={styles.when}>{stop.when}</p>
              <h2 className={styles.stopTitle}>{stop.title}</h2>
              <p className={styles.where}>{stop.where}</p>
            </div>
            <div className={styles.stopBody}>
              <p>{stop.description}</p>
              {stop.detail && <p className={styles.detail}>{stop.detail}</p>}
              <div className={styles.actions}>
                <GuideLink action={stop.action} context={stop.title} />
                {stop.source.href === stop.action.href ? (
                  <span className={styles.source}>Source {stop.source.label}</span>
                ) : (
                  <a
                    href={stop.source.href}
                    aria-label={`${stop.source.label}, source for ${stop.title}`}
                    className={styles.sourceLink}
                  >
                    {stop.source.label}
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {(guide.note || guide.secondaryAction) && (
        <footer className={styles.footer}>
          {guide.note && <p>{guide.note}</p>}
          {guide.secondaryAction && <GuideLink action={guide.secondaryAction} />}
        </footer>
      )}
    </article>
  );
}
