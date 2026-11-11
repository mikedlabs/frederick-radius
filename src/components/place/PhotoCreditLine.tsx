import type { CSSProperties } from "react";

/** The facts every reviewed photograph credit prints, in reading order. */
export type PhotoCreditFacts = {
  author: string;
  /** Known capture year; absent when the record has no valid capture date. */
  year: string | null;
  license: string;
  licenseHref: string;
  /** Publisher label, such as "Wikimedia Commons" or "Frederick County". */
  sourceLabel: string;
  sourceHref: string;
  /** An earlier publication the source file was copied from. */
  originalSourceHref?: string;
  /** The stored file differs from the source file. */
  edited: boolean;
};

/**
 * One short muted credit line for a reviewed licensed photograph:
 * author · year · license · source · edited. License and source stay real,
 * underlined links with 44px targets. Render it outside any destination link.
 * The full change record stays in the data and is never printed here.
 */
export default function PhotoCreditLine({ credit, className = "", style }: {
  credit: PhotoCreditFacts;
  className?: string;
  style?: CSSProperties;
}) {
  const countyProvided = credit.sourceLabel === "Frederick County";
  return (
    <span
      data-photo-credit-line
      data-photo-edited={credit.edited || undefined}
      className={`block break-words text-xs leading-snug [&_a]:inline-flex [&_a]:min-h-11 [&_a]:min-w-11 [&_a]:items-center [&_a]:underline [&_a]:underline-offset-2 ${className}`}
      style={style}
    >
      <span className="sr-only">{countyProvided ? "Photo provided by " : "Photo by "}</span>
      {/* Flex rows with a small row gap keep wrapped 44px link targets apart. */}
      <span data-photo-credit-text className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <span data-photo-credit-author>{credit.author}</span>
        {credit.year && <> · <span data-photo-credit-year>{credit.year}</span></>}
        {" · "}
        <a href={credit.licenseHref} target="_blank" rel="noopener noreferrer">{credit.license}</a>
        {" · "}
        <a href={credit.sourceHref} target="_blank" rel="noopener noreferrer">{credit.sourceLabel}</a>
        {credit.originalSourceHref && <>
          {" · "}
          <a href={credit.originalSourceHref} target="_blank" rel="noopener noreferrer">Original photograph</a>
        </>}
        {credit.edited && <> · <span data-photo-credit-edited>edited</span></>}
      </span>
    </span>
  );
}
