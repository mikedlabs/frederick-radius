"use client";

import { useSyncExternalStore } from "react";
import { getScope, subscribeScopeChange, scopeTownSlug, scopeLabel } from "@/lib/scope";
import EventCard from "@/components/event/EventCard";
import { motion, AnimatePresence } from "framer-motion";
import type { EventWithMeta } from "@/lib/loaders/events";

export default function TownEventHighlightClient({
  groupedEvents,
  nowIso,
}: {
  groupedEvents: Record<string, EventWithMeta[]>;
  nowIso: string;
}) {
  const scope = useSyncExternalStore(subscribeScopeChange, getScope, () => null);
  const townSlug = scopeTownSlug(scope);
  
  if (!townSlug) return null;

  const townEvents = groupedEvents[townSlug] || [];
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
          {townEvents.map((ev) => (
            <li key={ev.slug}>
              <EventCard event={ev} nowISO={nowIso} />
            </li>
          ))}
        </ul>
      </motion.div>
    </AnimatePresence>
  );
}
