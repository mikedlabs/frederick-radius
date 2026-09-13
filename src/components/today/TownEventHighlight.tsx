import type { EventArchiveSnapshot } from "@/lib/loaders/todayEventSnapshot";
import type { EventWithMeta } from "@/lib/loaders/events";
import { compareForLead } from "@/lib/events/lead-rank";
import { isEventToday, isEventEnded } from "@/lib/eventWhenLabel";
import TownEventHighlightClient from "./TownEventHighlightClient";

export default async function TownEventHighlight({
  eventsPromise,
  nowIso,
}: {
  eventsPromise: Promise<EventArchiveSnapshot>;
  nowIso: string;
}) {
  const snapshot = await eventsPromise;
  const now = new Date(nowIso);

  // Group events by municipality, keep only valid today events
  const byTown: Record<string, EventWithMeta[]> = {};
  
  for (const ev of snapshot.publicEvents) {
    if (!ev.municipality) continue;
    if (!isEventToday(ev.starts_at, now) || isEventEnded(ev, now)) continue;
    
    if (!byTown[ev.municipality]) {
      byTown[ev.municipality] = [];
    }
    byTown[ev.municipality].push(ev);
  }

  // Sort and take top 4
  for (const town in byTown) {
    byTown[town] = byTown[town].sort(compareForLead).slice(0, 4);
  }

  return <TownEventHighlightClient groupedEvents={byTown} nowIso={nowIso} />;
}
