"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, Trash2 } from "lucide-react";
import { useDayPlan, removeDayPlanEvent, restoreDayPlanEvent } from "@/hooks/useItinerary";
import { notifyError, notifyRemoved } from "@/lib/feedback/notify";
import type { EventWithMeta } from "@/lib/loaders/events";
import { buildDaySchedule, type EventScheduleMark } from "@/lib/events/day-schedule";
import { easternDayKey } from "@/lib/tz";
import { eventHasPreciseDisplayLocation } from "@/lib/events/geo-confidence";
import { MAX_EVENTS_BY_SLUG } from "@/lib/events/eventSlugBatch";
import { fetchSavedEventsHydration, mergeSavedEventHydration } from "@/lib/events/saved-event-hydration";
import EventCard from "@/components/event/EventCard";
import AppMapClient from "@/components/map/AppMapClient";
import { Button } from "@/components/ui/Button";

const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric", year: "numeric" });

export default function ItineraryClient() {
  const { items, status: storageStatus } = useDayPlan();
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [byId, setById] = useState(new Map<string, EventWithMeta>());
  const [state, setState] = useState<"loading" | "ready" | "partial">("loading");
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<"list" | "map">("list");

  useEffect(() => {
    if (!items.length) return;
    const controller = new AbortController();
    async function load() {
      setState("loading");
      let resolved = new Map<string, EventWithMeta>();
      let partial = false;
      try {
        for (let start = 0; start < items.length; start += MAX_EVENTS_BY_SLUG) {
          const batch = items.slice(start, start + MAX_EVENTS_BY_SLUG).map(item => item.id);
          const result = await fetchSavedEventsHydration(batch, controller.signal);
          if (controller.signal.aborted) return;
          resolved = mergeSavedEventHydration(resolved, result);
          if (result.degraded || result.unresolvedSlugs.length) partial = true;
        }
        setById(resolved);
        setState(partial ? "partial" : "ready");
      } catch {
        if (!controller.signal.aborted) setState("partial");
      }
    }
    void load();
    return () => controller.abort();
  }, [items, retry]);

  async function remove(id: string, name: string, trigger?: HTMLButtonElement) {
    const shouldFocus = trigger && trigger === document.activeElement;
    const controls = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("[data-remove-plan-event]") ?? []);
    const index = trigger ? controls.indexOf(trigger) : -1;
    const nextId = (controls[index + 1] ?? controls[index - 1])?.dataset.removePlanEvent;
    try {
      const removed = await removeDayPlanEvent(id);
      if (!removed) return;
      const undo = async () => {
        try { await restoreDayPlanEvent(removed); }
        catch { notifyError({ title: "Could not restore the Day Plan event", onRetry: () => void undo() }); }
      };
      if (shouldFocus) requestAnimationFrame(() => {
        if (document.activeElement !== document.body && document.activeElement !== trigger) return;
        const next = nextId && list.current?.querySelector<HTMLButtonElement>(`[data-remove-plan-event="${CSS.escape(nextId)}"]`);
        (next || heading.current)?.focus({ preventScroll: true });
      });
      notifyRemoved({ title: `Removed from Day Plan · ${name}`, label: name, onUndo: () => void undo() });
    } catch {
      notifyError({ title: "Could not remove the Day Plan event", onRetry: () => void remove(id, name) });
    }
  }

  const rows = items.map(item => ({ id: item.id, event: byId.get(item.id) }))
    .sort((a, b) => (a.event ? Date.parse(a.event.starts_at) : Infinity) - (b.event ? Date.parse(b.event.starts_at) : Infinity));
  const events = rows.flatMap(row => row.event ? [row.event] : []);
  const dayByEvent = new Map<EventWithMeta, string>();
  const byDay = new Map<string, EventWithMeta[]>();
  for (const event of events) {
    const start = Date.parse(event.starts_at);
    if (!Number.isFinite(start)) continue;
    const day = easternDayKey(new Date(start));
    dayByEvent.set(event, day);
    const otherEvents = byDay.get(day);
    if (otherEvents) otherEvents.push(event);
    else byDay.set(day, [event]);
  }
  const marks = new Map<EventWithMeta, EventScheduleMark>();
  for (const [day, sameDay] of byDay) {
    const current = buildDaySchedule(sameDay, day);
    if (current.size <= 1) continue;
    for (const [event, mark] of current) marks.set(event, mark);
  }
  const mapEvents = events.filter(eventHasPreciseDisplayLocation).map(event => ({
    slug: event.slug, title: event.title, starts_at: event.starts_at, ends_at: event.ends_at,
    is_all_day: event.is_all_day, venue_name: event.venue_name, category: event.category,
    lng: event.geom.lng, lat: event.geom.lat, venue_place_slug: event.venue_place_slug,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5">
      <header className="space-y-2">
        <h1 ref={heading} tabIndex={-1} className="text-[1.75rem] font-extrabold leading-tight text-[var(--app-ink)]">Day Plan</h1>
        {storageStatus === "loading" ? <p role="status">Loading your Day Plan…</p> : storageStatus === "unavailable" ? (
          <p role="alert">This browser could not read your Day Plan. Open Saved to see your bookmarked events. <Button href="/my-radius" variant="quiet">Open Saved</Button></p>
        ) : !items.length ? (
          <>
            <p>Your Day Plan is empty. Events you bookmark today appear in Saved.</p>
            <Button href="/my-radius" variant="secondary">Open Saved</Button>
          </>
        ) : (
          <p>{items.length} {items.length === 1 ? "event" : "events"} in your Day Plan</p>
        )}
      </header>
      {items.length > 0 && <>
        <div role="group" aria-label="Day Plan view" className="flex flex-wrap gap-2">
          <Button variant={view === "list" ? "secondary" : "quiet"} aria-pressed={view === "list"} onClick={() => setView("list")}>Timeline</Button>
          <Button variant={view === "map" ? "secondary" : "quiet"} aria-pressed={view === "map"} onClick={() => setView("map")}>Map</Button>
        </div>
        {state === "loading" && <p role="status">Checking event listings…</p>}
        {state === "partial" && <div className="space-y-2" role="status">
          <p>Some event details could not be checked. Your Day Plan is still on this device.</p>
          <Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Try again</Button>
        </div>}
        {view === "list" ? (
          <ul ref={list} aria-label="Events in your Day Plan" className="divide-y divide-[var(--app-border)]">
            {rows.map(({ id, event }) => {
              const name = event?.title || id;
              const day = event && dayByEvent.get(event);
              return <li key={id} className="min-w-0 py-2">
                {event && day && byDay.get(day)?.[0] === event && (
                  <h2 className="pb-1 pt-3 font-serif text-[1.35rem] font-semibold leading-tight"><time dateTime={day}>{dayLabel.format(new Date(event.starts_at))}</time></h2>
                )}
                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0 flex-1">
                    {event ? <EventCard event={event} variant="row" showDate={!day} headingLevel={day ? 3 : 2} schedule={marks.get(event)} /> : <p><Calendar className="me-1 inline size-4" aria-hidden />{id}{state === "ready" ? " · Listing unavailable" : ""}</p>}
                  </div>
                  <button type="button" data-remove-plan-event={id} disabled={storageStatus !== "ready"} className="grid size-11 shrink-0 place-items-center rounded-[var(--app-radius-md)] text-[var(--app-ink-2)] hover:bg-[var(--app-bg-sunken)]" aria-label={`Remove ${name} from Day Plan`} onClick={e => void remove(id, name, e.currentTarget)}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>;
            })}
          </ul>
        ) : mapEvents.length > 0 ? (
          <div className="relative h-[min(62dvh,36rem)]"><AppMapClient events={mapEvents} places={[]} fullBleed /></div>
        ) : state !== "loading" && <p>No mapped event locations are available for this Day Plan.</p>}
      </>}
    </div>
  );
}
