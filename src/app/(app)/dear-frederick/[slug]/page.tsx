import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import { LETTERS, PUBLISHED_LETTERS, letterBySlug } from "@/data/dear-frederick";

// A closed, curated set: prebuild the published letters and 404 any other
// slug (the same posture as /places), so a withheld or unknown letter never
// renders a soft-200 shell.
export const dynamicParams = false;

export function generateStaticParams() {
  return LETTERS.filter((l) => l.published).map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const letter = letterBySlug(slug);
  if (!letter) return {};
  return {
    alternates: { canonical: `/dear-frederick/${letter.slug}` },
    title: `${letter.title} · Dear Frederick`,
    description: letter.alt,
  };
}

/** "2025-01-02" → "January 2, 2025", "2025-01" → "January 2025", null → "". */
function formatReceived(value: string | null): string {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  if (!y) return "";
  const month = m ? new Date(Date.UTC(y, m - 1, d || 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }) : "";
  if (m && d) return `${month} ${d}, ${y}`;
  if (m) return `${month} ${y}`;
  return String(y);
}

export default async function LetterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const letter = letterBySlug(slug);
  if (!letter) notFound();

  const idx = PUBLISHED_LETTERS.findIndex((l) => l.slug === letter.slug);
  // Wrap around the collection so there is always a next letter to read.
  const prev = PUBLISHED_LETTERS[(idx - 1 + PUBLISHED_LETTERS.length) % PUBLISHED_LETTERS.length];
  const next = PUBLISHED_LETTERS[(idx + 1) % PUBLISHED_LETTERS.length];
  const received = formatReceived(letter.receivedOn);

  return (
    <article className="relative space-y-6">
      <PageBloom variant="warm-cool" />

      <Link
        href="/dear-frederick"
        className="tap-44 inline-flex items-center gap-1.5 text-[13px] font-semibold"
        style={{ color: "var(--app-cool)" }}
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        Dear Frederick
      </Link>

      <header className="max-w-[42rem] space-y-1.5">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-brand-press)" }}>
          Letter no. {letter.number}
          {received ? ` · ${received}` : ""}
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          {letter.title}
        </h1>
        <p className="text-[13.5px]" style={{ color: "var(--app-ink-3)" }}>
          {letter.signature}
        </p>
      </header>

      {/* The letter itself, framed like a document. This is the primary
          content; the transcription below is the reading and screen-reader
          version of the same words. */}
      <figure
        className="mx-auto w-full max-w-[40rem] overflow-hidden rounded-[var(--app-radius-sm)] border bg-white p-2.5 sm:p-3"
        style={{
          borderColor: "var(--app-border-strong, var(--app-border))",
          boxShadow: "var(--app-elev-2), var(--app-hi)",
        }}
      >
        <Image
          src={letter.image}
          alt={letter.alt}
          width={letter.width}
          height={letter.height}
          sizes="(min-width: 640px) 40rem, 94vw"
          priority
          className="h-auto w-full rounded-[3px]"
        />
      </figure>

      <section aria-labelledby="transcription-heading" className="max-w-[42rem]">
        <h2
          id="transcription-heading"
          className="flex items-baseline gap-2.5 text-[11px] font-bold uppercase tracking-[0.12em]"
          style={{ color: "var(--app-brand-press)" }}
        >
          <span aria-hidden className="block h-[3px] w-7 translate-y-[-2px] rounded-full" style={{ background: "var(--app-brand)" }} />
          What it says
        </h2>
        <div className="mt-3 space-y-3 font-serif text-[15.5px] leading-[1.7]" style={{ color: "var(--app-ink)" }}>
          {letter.body.map((paragraph, i) => (
            <p key={i} className="[text-wrap:pretty]">
              {paragraph}
            </p>
          ))}
        </div>
        <p className="mt-4 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          The letter is transcribed as written, in the sender&rsquo;s own words.
        </p>
      </section>

      {/* Read on: previous and next letters in the collection. */}
      <nav className="grid grid-cols-2 gap-3 border-t pt-5" style={{ borderColor: "var(--app-border)" }} aria-label="More letters">
        <Link href={`/dear-frederick/${prev.slug}`} className="tactile-interactive group min-w-0">
          <span className="flex items-center gap-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden /> Previous
          </span>
          <span className="mt-1 block truncate font-serif text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>
            {prev.title}
          </span>
        </Link>
        <Link href={`/dear-frederick/${next.slug}`} className="tactile-interactive group min-w-0 text-right">
          <span className="flex items-center justify-end gap-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
            Next <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </span>
          <span className="mt-1 block truncate font-serif text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>
            {next.title}
          </span>
        </Link>
      </nav>

      {/* The write-in invitation, same as the index. */}
      <section
        aria-labelledby="write-in-heading"
        className="rounded-[var(--app-radius-lg)] border p-4"
        style={{
          borderColor: "var(--app-border-strong, var(--app-border))",
          background: "var(--app-bg-sunken)",
        }}
      >
        <h2 id="write-in-heading" className="font-serif text-[16px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Write your own
        </h2>
        <p className="mt-1 text-[13.5px] leading-[1.6]" style={{ color: "var(--app-ink-2)" }}>
          Write it by hand and mail it. Sign it or leave it anonymous.
        </p>
        <p className="mt-2 font-mono text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink)" }}>
          Dear Frederick
          <br />
          PO Box 334
          <br />
          Frederick, MD 21705
        </p>
      </section>
    </article>
  );
}
