import type { Metadata } from "next";
import ProtoFrame from "@/components/proto/ProtoFrame";
import TimeLens from "@/components/proto/TimeLens";
import { sunTimes } from "@/lib/sun";
import { FREDERICK_LAT, FREDERICK_LNG } from "@/lib/almanac";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Prototype: the Time Lens" };
export const dynamic = "force-dynamic";

// Minutes into the Eastern calendar day for an instant (0..1439), or null.
function etMinutes(d: Date | null): number | null {
  if (!d) return null;
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0");
  return (get("hour") % 24) * 60 + get("minute");
}
const etDate = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export default async function Page() {
  const now = new Date();
  const sun = sunTimes(now, FREDERICK_LAT, FREDERICK_LNG);

  // Sun windows as minutes-into-ET-day, so the client scrubber can classify any
  // scrubbed minute as night / golden / day without re-running solar math.
  const windows = {
    sunrise: etMinutes(sun.sunrise),
    goldenMorningEnd: etMinutes(sun.goldenMorningEnd),
    goldenEveningStart: etMinutes(sun.goldenEveningStart),
    sunset: etMinutes(sun.sunset),
    dusk: etMinutes(sun.dusk),
  };

  // Today's public events, slimmed to what the lens needs + their ET start
  // minute. Composes the SAME unified set /today and /events use.
  const { publicEvents } = await assembleUnifiedEvents(now);
  const todayStr = etDate(now);
  const events = publicEvents
    .filter((e) => etDate(new Date(e.starts_at)) === todayStr)
    .map((e) => ({
      title: e.title,
      category: e.category,
      venue: e.venue_name,
      startMin: etMinutes(new Date(e.starts_at)) ?? 0,
    }))
    .sort((a, b) => a.startMin - b.startMin);

  const nowMin = etMinutes(now) ?? 12 * 60;

  return (
    <ProtoFrame
      title="The Time Lens"
      blurb="Drag through the day and watch the light change: sunrise, golden hour, dusk, and what's on at that hour. One scrubber over the same sun math and unified events the rest of the app uses."
    >
      <TimeLens windows={windows} events={events} nowMin={nowMin} />
    </ProtoFrame>
  );
}
