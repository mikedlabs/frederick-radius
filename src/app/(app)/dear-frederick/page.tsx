import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import { PUBLISHED_LETTERS } from "@/data/dear-frederick";

export const metadata: Metadata = {
  alternates: { canonical: "/dear-frederick" },
  title: "Dear Frederick",
  description:
    "Handwritten letters to Frederick, mailed to a box downtown and gathered here. People write to the place itself about what it has meant to them.",
};

/**
 * /dear-frederick — the community letter project, read inside the app.
 *
 * People mail handwritten letters about Frederick to a PO box. The scans are
 * the content; the handwriting carries what a transcription cannot, so the
 * page frames the letters like archived documents and keeps the app's own
 * editorial chrome around them. Each opens to the full letter and its
 * transcription at /dear-frederick/[slug].
 */
export default function DearFrederickIndex() {
  return (
    <div className="relative space-y-7">
      <PageBloom variant="warm-cool" />

      <header className="max-w-[42rem] space-y-3">
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Dear Frederick
        </h1>
        <p className="font-serif text-[17px] leading-[1.6]" style={{ color: "var(--app-ink)" }}>
          People write letters to Frederick. Not to the paper or the county council, to the place
          itself, about what it has meant to them.
        </p>
        <p className="text-[14px] leading-[1.65]" style={{ color: "var(--app-ink-2)" }}>
          They come in the mail, some signed and some not, and they are gathered here just as they
          were written. Read them below.
        </p>
      </header>

      {/* The write-in invitation. One quiet card, the PO box as the real
          address it is; the point of the project is the mailed letter. */}
      <section
        aria-labelledby="write-in-heading"
        className="rounded-[var(--app-radius-lg)] border p-4"
        style={{
          borderColor: "var(--app-border-strong, var(--app-border))",
          background: "var(--app-bg-sunken)",
        }}
      >
        <h2
          id="write-in-heading"
          className="font-serif text-[16px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Write your own
        </h2>
        <p className="mt-1 text-[13.5px] leading-[1.6]" style={{ color: "var(--app-ink-2)" }}>
          Put it on paper and mail it. Sign it or leave it anonymous.
        </p>
        <p className="mt-2 font-mono text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink)" }}>
          Dear Frederick
          <br />
          PO Box 334
          <br />
          Frederick, MD 21705
        </p>
      </section>

      {/* The letters, framed like documents, in a plain responsive grid so
          the mixed portrait and landscape scans read in order (No. 7, 5, 4…)
          left to right. */}
      <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        {PUBLISHED_LETTERS.map((l) => (
          <li key={l.slug}>
            <Link
              href={`/dear-frederick/${l.slug}`}
              className="tactile-interactive group block rounded-[var(--app-radius-md)]"
            >
              <figure
                className="overflow-hidden rounded-[var(--app-radius-sm)] border bg-white p-2"
                style={{
                  borderColor: "var(--app-border-strong, var(--app-border))",
                  boxShadow: "var(--app-elev-1), var(--app-hi)",
                }}
              >
                <Image
                  src={l.image}
                  alt={l.alt}
                  width={l.width}
                  height={l.height}
                  sizes="(min-width: 640px) 20rem, 92vw"
                  className="h-auto w-full rounded-[3px]"
                />
              </figure>
              <div className="mt-2 flex items-baseline justify-between gap-3 px-0.5">
                <div className="min-w-0">
                  <h3
                    className="font-serif text-[17px] font-semibold leading-snug tracking-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {l.title}
                  </h3>
                  <p className="mt-0.5 truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                    {l.signature}
                  </p>
                </div>
                <span
                  aria-hidden
                  className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.08em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  No. {l.number}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="max-w-[42rem] text-[13px] leading-[1.65]" style={{ color: "var(--app-ink-3)" }}>
        Letters are published as they arrive, in the writer&rsquo;s own hand. A transcription sits
        beside each one for reading and for anyone using a screen reader.
      </p>

      <div className="pt-1">
        <Link
          href="/dear-frederick/who-are-we"
          className="tap-44 inline-flex items-center gap-1.5 text-[14px] font-semibold"
          style={{ color: "var(--app-cool)" }}
        >
          Start with the first letter
          <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
