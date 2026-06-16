import Link from "next/link";
import { Martini } from "lucide-react";
import { placesWithFieldHappyHour } from "@/lib/loaders/fieldNotes";
import { happyHourStatus } from "@/lib/happyHour";

/**
 * Happy hours ON NOW — the most time-live "what's worth heading out for this
 * minute" signal, straight off the verified Field Notes moat. Counts the
 * verified happy hours whose window includes right now (Eastern) and links to
 * /happy-hour. Server component; SELF-HIDES when none are live (mornings,
 * late night), so it only ever claims a real, current happy hour.
 */
export default function HappyHourNow({ now }: { now: Date }) {
  const onNow = placesWithFieldHappyHour().filter(
    (v) => happyHourStatus(v.happy_hour.schedule, now).state === "now",
  );
  if (onNow.length === 0) return null;
  const n = onNow.length;

  return (
    <Link
      href="/happy-hour"
      aria-label={`${n} happy hour${n === 1 ? "" : "s"} on right now`}
      className="tactile tactile-interactive flex items-center gap-3 rounded-[var(--app-radius-md)] px-3.5 py-2.5"
      style={{
        background: "color-mix(in srgb, var(--app-accent) 12%, var(--app-bg-elevated))",
        boxShadow: "var(--app-edge), var(--app-hi)",
      }}
    >
      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-accent) 20%, transparent)", color: "var(--app-accent)" }}>
        <Martini className="h-[18px] w-[18px]" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13.5px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
          <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-brand)" }} />
          {n} happy hour{n === 1 ? "" : "s"} on right now
        </span>
        <span className="block font-mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>
          Verified, on the clock
        </span>
      </span>
      <span aria-hidden className="shrink-0 text-[13px] font-semibold" style={{ color: "var(--app-accent)" }}>→</span>
    </Link>
  );
}
