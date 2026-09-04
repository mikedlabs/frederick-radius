import { Download, ExternalLink, Printer } from "lucide-react";
import Image from "next/image";

export const FAIR_COLORING_BOOK_PDF_URL =
  "/downloads/fair-nights-frederick-coloring-book.pdf";
export const FAIR_COLORING_BOOK_COVER_URL =
  "/images/fair/fair-nights-coloring-book-cover.svg";
export const COLOR_FREDERICK_URL = "https://www.colorfrederick.com";

/**
 * A deliberately secondary Fair extra. Planning stays ahead of promotion in
 * the Today view, while families still get one clear route to a free printable.
 */
export default function FairColoringBookCard() {
  return (
    <aside
      data-fair-coloring-book
      aria-labelledby="fair-coloring-book-heading"
      className="relative mt-5 overflow-hidden rounded-[var(--app-radius-xl)] border px-4 pb-4 pt-5 sm:grid sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-x-5 sm:px-5 sm:pb-5 sm:pt-6"
      style={{
        borderColor:
          "color-mix(in srgb, var(--app-amber) 48%, var(--app-border))",
        background:
          "linear-gradient(118deg, color-mix(in srgb, var(--app-amber) 13%, var(--app-bg-elevated-solid)), var(--app-bg-elevated-solid) 48%, color-mix(in srgb, var(--app-accent) 8%, var(--app-bg-elevated-solid)))",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1.5"
        style={{
          background:
            "linear-gradient(90deg, var(--app-brand) 0 24%, var(--app-amber) 24% 44%, var(--app-brand-2) 44% 63%, var(--app-cool) 63% 81%, var(--app-accent) 81% 100%)",
        }}
      />

      <div className="flex items-center gap-4 sm:contents">
        <div
          aria-hidden="true"
          className="relative ml-1 h-[104px] w-[80px] shrink-0 sm:row-span-2 sm:h-[132px] sm:w-[102px]"
        >
          <span
            className="absolute inset-1 -rotate-3 rounded-[var(--app-radius-sm)] border bg-[var(--app-bg-elevated-solid)]"
            style={{
              borderColor: "var(--app-border-strong)",
              boxShadow: "var(--app-elev-1)",
            }}
          />
          <span
            className="absolute inset-1 rotate-3 rounded-[var(--app-radius-sm)] border bg-[var(--app-bg-elevated-solid)]"
            style={{ borderColor: "var(--app-border-strong)" }}
          />
          <Image
            src={FAIR_COLORING_BOOK_COVER_URL}
            alt=""
            width="850"
            height="1100"
            loading="lazy"
            unoptimized
            className="relative h-full w-full rounded-[var(--app-radius-sm)] border bg-[var(--app-bg-elevated-solid)] object-cover"
            style={{
              borderColor: "var(--app-border-strong)",
              boxShadow: "var(--app-elev-2)",
            }}
          />
        </div>

        <div className="min-w-0 self-center">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "var(--app-brand-press)" }}
          >
            Free Fair extra
          </p>
          <h2
            id="fair-coloring-book-heading"
            className="mt-1 text-[23px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[26px]"
          >
            Fair Nights
          </h2>
          <p
            id="fair-coloring-book-description"
            className="mt-1.5 text-[14px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            Download a free, independent 12-page Frederick coloring book based
            on original Fair photographs.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1 sm:col-start-2 sm:mt-3 sm:flex-row sm:items-center sm:gap-3">
        <a
          href={FAIR_COLORING_BOOK_PDF_URL}
          download
          aria-describedby="fair-coloring-book-description fair-coloring-book-format"
          className="tap-44 tactile tactile-interactive inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-[13px] font-extrabold text-[var(--app-on-brand)] transition active:scale-[0.98] motion-reduce:transition-none sm:w-auto"
          style={{
            background: "var(--app-brand)",
            boxShadow: "var(--app-elev-1), var(--app-lip)",
          }}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download and print
        </a>
        <a
          href={COLOR_FREDERICK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44 inline-flex min-h-11 items-center justify-center gap-1.5 px-2 text-[13px] font-semibold underline decoration-transparent underline-offset-4 transition hover:decoration-current motion-reduce:transition-none"
          style={{ color: "var(--app-ink-2)" }}
        >
          More Frederick pages
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>

      <p
        id="fair-coloring-book-format"
        className="mt-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold sm:col-start-2 sm:justify-start"
        style={{ color: "var(--app-ink-3)" }}
      >
        <Printer className="h-3.5 w-3.5" aria-hidden="true" />
        US Letter PDF. Print only the pages you want.
      </p>
    </aside>
  );
}
