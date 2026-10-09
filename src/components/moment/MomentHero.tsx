import RadiusPhoto, {
  RadiusPhotoScope,
  RadiusPhotoWhen,
} from "@/components/ui/RadiusPhoto";
import type { MomentHeroImage, MomentPhotoCredit } from "./momentGuide";
import styles from "./MomentHero.module.css";
import MomentPhotoCreditLine from "./MomentPhotoCreditLine";

/**
 * MomentHero opens a moment hub with the most honest picture it has, chosen
 * by `momentHeroImage` (src/components/moment/momentGuide.ts):
 *
 * - An owned photograph of the occasion runs full-bleed (320px on phones,
 *   460px from 1024px) with an Ink scrim on its bottom 60% and the title on it.
 * - A licensed town photograph runs full-bleed at 16:10 with nothing drawn on
 *   it. Its credit names what it shows and appears only after it loads, and
 *   the title sits on Cream below.
 * - Without a photograph, the title sits on Cream.
 *
 * A photograph that fails to load is removed, and the owned layout falls
 * back to the Cream title. Every rung closes with one 6px Brick rule.
 */
export type MomentHeroProps = {
  title: string;
  /** "OCT 10-11 · 2026" and its spoken form. */
  dateLine?: { text: string; label: string } | null;
  image: MomentHeroImage;
};

function DateLine({ dateLine }: { dateLine: MomentHeroProps["dateLine"] }) {
  if (!dateLine) return null;
  return (
    <p className={`text-meta-lg font-bold ${styles.dateLine}`} data-moment-date-line>
      <span aria-hidden>{dateLine.text}</span>
      <span className="sr-only">{dateLine.label}</span>
    </p>
  );
}

function TitleOnPaper({ title, dateLine }: Pick<MomentHeroProps, "title" | "dateLine">) {
  return (
    <div className={styles.titleOnPaper}>
      <h1 className={`font-editorial ${styles.title}`}>{title}</h1>
      <DateLine dateLine={dateLine} />
    </div>
  );
}

function Rule() {
  return <span aria-hidden data-moment-rule className={`${styles.rule} ${styles.bleed}`} />;
}

function LicensedCredit({ credit }: { credit: MomentPhotoCredit }) {
  return (
    <figcaption className={`text-caption ${styles.credit} ${styles.gutter}`} data-moment-photo-credit>
      <MomentPhotoCreditLine credit={credit} />
    </figcaption>
  );
}

export default function MomentHero({ title, dateLine, image }: MomentHeroProps) {
  if (image.kind === "owned") {
    return (
      <header data-moment-hero="owned">
        <RadiusPhotoScope src={image.src} size={1280}>
          <RadiusPhotoWhen is="visible">
            <div className={`${styles.ownedFrame} ${styles.bleed}`}>
              <RadiusPhoto
                size={1280}
                alt={image.alt}
                priority
                fetchPriority="high"
                sizes="(min-width: 640px) 640px, 100vw"
                className={styles.fill}
              />
              <span aria-hidden className={styles.scrim} />
              <div className={`${styles.titleOnPhoto} ${styles.gutter}`}>
                <h1 className={`font-editorial ${styles.title}`}>{title}</h1>
                <DateLine dateLine={dateLine} />
              </div>
            </div>
            <Rule />
          </RadiusPhotoWhen>
          <RadiusPhotoWhen is="ready">
            <p className={`text-caption ${styles.credit}`} data-moment-photo-credit>
              {image.credit}
            </p>
          </RadiusPhotoWhen>
          <RadiusPhotoWhen is="missing">
            <TitleOnPaper title={title} dateLine={dateLine} />
            <Rule />
          </RadiusPhotoWhen>
        </RadiusPhotoScope>
      </header>
    );
  }

  if (image.kind === "licensed") {
    return (
      <header data-moment-hero="licensed">
        <RadiusPhotoScope src={image.src} size={960}>
          <RadiusPhotoWhen is="visible">
            <figure className={`${styles.licensedFigure} ${styles.bleed}`}>
              <RadiusPhoto
                size={960}
                alt={image.alt}
                priority
                fetchPriority="high"
                sizes="(min-width: 640px) 640px, 100vw"
                className={styles.licensedFrame}
              />
              <RadiusPhotoWhen is="ready">
                <LicensedCredit credit={image.credit} />
              </RadiusPhotoWhen>
            </figure>
          </RadiusPhotoWhen>
        </RadiusPhotoScope>
        <TitleOnPaper title={title} dateLine={dateLine} />
        <Rule />
      </header>
    );
  }

  return (
    <header data-moment-hero="none">
      <TitleOnPaper title={title} dateLine={dateLine} />
      <Rule />
    </header>
  );
}
