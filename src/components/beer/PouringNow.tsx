"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowRight, Clock } from "lucide-react";

/**
 * The live layer on the pour book: which of the 17 taprooms are open at
 * this minute, from the same verified-hours machinery /nearby runs
 * (/api/want?c=breweries, no-store). The page itself is ISR-cached an
 * hour, so open state must never render on the server here — a client
 * island keeps the claim honest to the minute. Fail-soft: any error
 * renders nothing and the guide stands on its own.
 */

type Row = { slug: string; name: string; fact: string; where: string | null; photo: string | null };
type WantPayload = {
  hero: Row | null;
  also: Row[];
  later: Row[];
  laterMore: number;
  total: number;
};

const SHOW = 5;

export default function PouringNow() {
  const [data, setData] = useState<WantPayload | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/want?c=breweries", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WantPayload | null) => {
        if (d) setData(d);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  if (!data) return null;
  const open = [data.hero, ...data.also].filter((r): r is Row => r != null);
  const next = data.later[0] ?? null;
  if (open.length === 0 && !next) return null;

  return (
    <section
      aria-labelledby="pouring-now-heading"
      className="rounded-[var(--app-radius-lg)] border p-4 sm:p-5"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            The live layer
          </p>
          <h2
            id="pouring-now-heading"
            className="mt-0.5 font-serif text-[22px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {open.length > 0 ? "Pouring right now" : "Doors open next"}
          </h2>
        </div>
        {open.length > 0 && (
          <p className="shrink-0 font-mono text-[12px] font-bold tabular-nums" style={{ color: "var(--app-positive)" }}>
            {open.length + Math.max(0, data.total - open.length - data.later.length - data.laterMore) >= open.length
              ? `${open.length} open`
              : `${open.length} open`}
          </p>
        )}
      </div>

      {open.length > 0 ? (
        <ul className="mt-3 space-y-0.5">
          {open.slice(0, SHOW).map((r) => (
            <li key={r.slug}>
              <Link
                href={`/places/${r.slug}`}
                className="tap-44-y -mx-1.5 flex items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 transition hover:bg-[var(--app-bg-sunken)]"
              >
                {r.photo && (
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[10px]">
                    {/* Proxy photos are already sized + cached; /_next/image
                        re-optimizing them breaks (PlacePhoto convention). */}
                    <Image src={r.photo} alt="" fill sizes="40px" className="object-cover" unoptimized={r.photo.startsWith("/api/place-photo")} />
                  </span>
                )}
                {/* Name over time, never truncated into "Monocacy Brewin…" —
                    with the photo in the row there is no width for a leader. */}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                    {r.name}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] tabular-nums" style={{ color: "var(--app-positive)" }}>
                    {r.fact}
                    {r.where ? <span style={{ color: "var(--app-ink-3)" }}> · {r.where}</span> : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        next && (
          <p className="mt-3 flex items-center gap-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-3)" }} />
            <span>
              Every taproom is closed right now. First to open:{" "}
              <Link href={`/places/${next.slug}`} className="font-semibold underline underline-offset-2" style={{ color: "var(--app-ink)" }}>
                {next.name}
              </Link>{" "}
              ({next.fact.toLowerCase()}).
            </span>
          </p>
        )
      )}

      {open.length > SHOW && (
        <Link
          href="/nearby?c=breweries"
          className="tap-44-y mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold"
          style={{ color: "var(--app-ink-2)" }}
        >
          All {open.length} open taprooms, nearest first
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </Link>
      )}
    </section>
  );
}
