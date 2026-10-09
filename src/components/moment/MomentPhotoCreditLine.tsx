import type { MomentPhotoCredit } from "./momentGuide";

/**
 * The attribution a licensed Commons photo needs wherever it appears: what
 * the frame shows, the author linked to the file's page, and the license
 * linked to its deed. Inline content, so the hub hero's figcaption and the
 * Today card's caption wrap it in their own element.
 */
export default function MomentPhotoCreditLine({ credit }: { credit: MomentPhotoCredit }) {
  const depicts = credit.depicts.replace(/[.\s]+$/, "");
  return (
    <>
      {depicts}. Photo:{" "}
      <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        {credit.author}
      </a>
      ,{" "}
      {credit.licenseUrl ? (
        <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer license" className="underline underline-offset-2">
          {credit.license}
        </a>
      ) : (
        credit.license
      )}
    </>
  );
}
