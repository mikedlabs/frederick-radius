import Link from "next/link";
import { allUpcoming } from "@/lib/loaders/events";
import { sunTimes } from "@/lib/sun";
import { FREDERICK_CENTER } from "@/lib/geo";
import Masthead from "../components/Masthead";

export const dynamic = "force-dynamic";

const ET = "America/New_York";
const hhmm = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" }).format(d) : "--";

/**
 * The empty state, written as an identity moment. This is the late-night
 * case: nothing is open. The screen does not apologize or show a blank. It
 * states the honest fact, then hands the user the next real thing to do
 * (the morning, or tomorrow's first event), in the product voice.
 */
export default function LabAEmpty() {
  const now = new Date();
  const sun = sunTimes(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
  const tomorrow = allUpcoming(now, 8).find((e) => new Date(e.starts_at) > now);

  return (
    <main className="pb-16">
      <Masthead />
      <div className="px-[var(--a-gutter)] pt-16">
        <p className="lab-a-mono uppercase tracking-[0.2em]" style={{ fontSize: "var(--a-size-label)", color: "var(--a-ink-3)" }}>
          11:42 PM
        </p>
        <h1 className="lab-a-display pt-4" style={{ fontSize: "var(--a-size-title)" }}>
          Frederick has gone to bed.
        </h1>
        <p className="pt-4" style={{ fontSize: "var(--a-size-body)", color: "var(--a-ink-2)", lineHeight: 1.55 }}>
          Nothing worth recommending is open at this hour, and a guide that
          pretended otherwise would be lying to you. Here is what is next.
        </p>

        <div className="pt-10">
          <div className="lab-a-band" />
          <div className="flex items-baseline justify-between py-4">
            <span className="lab-a-mono uppercase tracking-[0.14em]" style={{ fontSize: "var(--a-size-data)", color: "var(--a-ink-3)" }}>
              SUNRISE
            </span>
            <span className="lab-a-mono uppercase" style={{ fontSize: "var(--a-size-data)", color: "var(--a-ink)" }}>
              {hhmm(sun.sunrise)}
            </span>
          </div>
          <div className="lab-a-rule" />
          {tomorrow && (
            <>
              <div className="flex items-baseline justify-between py-4">
                <span className="lab-a-mono uppercase tracking-[0.14em]" style={{ fontSize: "var(--a-size-data)", color: "var(--a-ink-3)" }}>
                  NEXT UP
                </span>
                <span className="lab-a-mono text-right uppercase" style={{ fontSize: "var(--a-size-data)", color: "var(--a-ink)", maxWidth: "60%" }}>
                  {tomorrow.title.slice(0, 30)}
                </span>
              </div>
              <div className="lab-a-rule" />
            </>
          )}
        </div>

        <Link
          href="/labs/a"
          className="lab-a-primary mt-10 flex h-12 w-full items-center justify-center"
          style={{ fontSize: "var(--a-size-body)" }}
        >
          See the morning
        </Link>
      </div>
    </main>
  );
}
