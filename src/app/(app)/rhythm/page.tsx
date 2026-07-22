import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getRhythmData } from "@/lib/rhythm";
import { SLOTS_PER_DAY } from "@/lib/rhythm";
import { PRODUCT_NAMES } from "@/lib/product-names";
import RhythmField from "@/components/rhythm/RhythmField";

/**
 * /rhythm — the trends hiding in plain sight inside 1,200 sets of posted
 * hours, rendered as the thing they describe: doors, on or off.
 *
 * Owner ask (Jul 2026): "interesting data trends based on business hours
 * ... an interactive experience with a digital feel." The mined truths
 * (Wednesday lunch beats Saturday night; Monday is the county's real day
 * off; the taprooms flip on at noon in unison; a three-member 2 AM club)
 * are the story chips; the light board makes them visible instead of
 * telling them.
 *
 * Static by nature: posted hours change only with the dataset, so this
 * prerenders and revalidates lazily. The board says "posted hours," not
 * "we promise the lights are on" - the footer keeps that honest.
 */

export const metadata: Metadata = {
  title: "The Rhythm",
  description:
    "See how many Frederick County places are listed as open at each hour of the week, based on their posted hours.",
  alternates: { canonical: "/rhythm" },
};

export const revalidate = 3600;

/** The current Eastern quarter-hour of the week (Mon=0), for the "Now" landing. */
function easternNowSlot(): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  return Math.max(0, day) * SLOTS_PER_DAY + Number(parts.hour) * 4 + Math.floor(Number(parts.minute) / 15);
}

export default function RhythmPage() {
  const data = getRhythmData();
  const initialSlot = easternNowSlot();

  return (
    <div className="relative mx-auto max-w-md space-y-5 py-6">
      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/pulse"
          className="inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          {PRODUCT_NAMES.liveConditions.uiLabel}
        </Link>
      </nav>

      <header>
        <div
          aria-hidden
          className="h-px"
          style={{ background: "linear-gradient(90deg, transparent, var(--app-border) 14%, var(--app-border) 86%, transparent)" }}
        />
        <div className="flex items-center justify-between py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-2)" }}>
            Frederick County
          </span>
          <span className="font-mono text-[10.5px] tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>
            {data.places.length} places
          </span>
        </div>
        <h1 className="font-serif text-[30px] font-semibold leading-[1.05] tracking-tight" style={{ color: "var(--app-ink)" }}>
          See when Frederick County places are open.
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Each light represents one place and turns on when its posted hours
          say it is open. Move through the week to compare different times,
          or select a light to identify the place.
        </p>
      </header>

      <RhythmField
        places={data.places}
        masksB64={data.masks}
        counts={data.counts}
        peak={data.peak}
        initialSlot={initialSlot}
      />

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        The display uses the posted hours of {data.places.length} operational
        places in the dataset. A light shows a posted opening, not a confirmed
        current status. Holidays and one-off closures may not appear here.
      </p>
    </div>
  );
}
