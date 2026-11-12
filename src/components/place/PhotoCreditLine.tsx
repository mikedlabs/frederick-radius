import type { CSSProperties, ReactNode } from "react";

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
 * The short muted credit for a reviewed licensed photograph: author and year
 * on one line, then license · source · edited. License and source stay real,
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
      {/* Two lines: the plain facts, then the links. Only the links line
          needs 44px targets, so the facts line stays at text height. The
          links line uses space, not dots, so no line starts or ends on a
          separator; hidden separators keep the whole credit reading and
          copying as "a · b · c". */}
      <span data-photo-credit-text className="flex flex-col items-start">
        <span>
          <span data-photo-credit-author>{credit.author}</span>
          {credit.year && <>{" · "}<span data-photo-credit-year>{credit.year}</span></>}
          <span className="sr-only">{" · "}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a href={credit.licenseHref} target="_blank" rel="noopener noreferrer">{credit.license}</a>
          <CreditPart><a href={credit.sourceHref} target="_blank" rel="noopener noreferrer">{credit.sourceLabel}</a></CreditPart>
          {credit.originalSourceHref && (
            <CreditPart><a href={credit.originalSourceHref} target="_blank" rel="noopener noreferrer">Original photograph</a></CreditPart>
          )}
          {credit.edited && <CreditPart><span data-photo-credit-edited>edited</span></CreditPart>}
        </span>
      </span>
    </span>
  );
}

/** One item on the links line. The links are underlined and spaced apart,
 * so the separator is hidden text: no wrapped row starts on a dot, and the
 * credit still reads and copies as "a · b · c". */
function CreditPart({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap"><span className="sr-only">{" · "}</span>{children}</span>;
}
