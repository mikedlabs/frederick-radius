"use client";

import { use, useSyncExternalStore } from "react";
import { getScope, subscribeScopeChange, scopeTownSlug, scopeLabel } from "@/lib/scope";
import type { EventArchiveSnapshot } from "@/lib/loaders/todayEventSnapshot";
import EventCard from "@/components/event/EventCard";
import { motion, AnimatePresence } from "framer-motion";
import { isEventToday, isEventEnded } from "@/lib/eventWhenLabel";
import { compareForLead } from "@/lib/events/lead-rank";

export default function TownEventHighlight({
  eventsPromise,
  nowIso,
}: {
  eventsPromise: Promise<EventArchiveSnapshot>;
  nowIso: string;
}) {
  const scope = useSyncExternalStore(subscribeScopeChange, getScope, () => null);
  const townSlug = scopeTownSlug(scope);
  
  // unwrapping promise in client component
  const snapshot = use(eventsPromise);
  
  if (!townSlug) return null;

  const now = new Date(nowIso);
  const townEvents = snapshot.publicEvents.filter(ev => {
    // Only today's events that haven't ended yet
    if (!isEventToday(ev, now) || isEventEnded(ev, now)) return false;
    // Only events that match the town slug
    return ev.municipality === townSlug;
  }).sort(compareForLead(now));

  if (townEvents.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="mb-6"
      >
        <h3 className="font-serif text-[22px] font-semibold leading-tight tracking-tight text-[var(--app-ink)] mb-4">
          Happening in {scopeLabel(scope)}
        </h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {townEvents.slice(0, 4).map((ev) => (
            <li key={ev.slug}>
              <EventCard event={ev} now={now} />
            </li>
          ))}
        </ul>
      </motion.div>
    </AnimatePresence>
  );
}
