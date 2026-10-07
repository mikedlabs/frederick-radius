"use client";

import { useEffect, useState } from "react";
import { useItineraryList, useRemoveItinerary } from "@/hooks/useItinerary";
import { useMounted } from "@/hooks/useSaved";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventCard from "@/components/event/EventCard";
import AppMapClient from "@/components/map/AppMapClient";
import Skeleton from "@/components/ui/Skeleton";
import Link from "next/link";
import { Calendar, Trash2 } from "lucide-react";
import { normalizeRequestedEventSlugList } from "@/lib/events/eventSlugBatch";
import { fetchDayPlanHydration } from "./dayPlanHydration";

type PlanRow = { event: EventWithMeta; requestedSlugs: string[]; retained: boolean };
type Check = { key: string; phase: "checking" | "ready" | "unavailable"; rows: PlanRow[]; missing: string[]; degraded: boolean };
const initialCheck: Check = { key: "", phase: "checking", rows: [], missing: [], degraded: false };

export default function ItineraryClient() {
  const itineraryItems = useItineraryList();
  const removeSavedReferences = useRemoveItinerary();
  const mounted = useMounted();
  const [check, setCheck] = useState<Check>(initialCheck);
  const [attempt, setAttempt] = useState(0);
  const [removeFailed, setRemoveFailed] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const requested = normalizeRequestedEventSlugList(itineraryItems.map((item) => item?.id));
  const key = JSON.stringify(requested);

  useEffect(() => {
    if (!mounted) return;
    const slugs: string[] = JSON.parse(key);
    const controller = new AbortController();
    // A removed reference is never allowed back into a pending or retained row.
    const retain = (rows: PlanRow[], allowed: Set<string>): PlanRow[] => rows
      .map((row) => ({ ...row, requestedSlugs: row.requestedSlugs.filter((slug) => allowed.has(slug)), retained: true }))
      .filter((row) => row.requestedSlugs.length > 0);
    const wanted = new Set(slugs);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- begins this explicit source check
    setCheck((previous) => ({ ...previous, key, phase: "checking", rows: retain(previous.rows, wanted), missing: [] }));
    if (slugs.length === 0) {
      setCheck({ ...initialCheck, key, phase: "ready" });
      return () => controller.abort();
    }
    fetchDayPlanHydration(slugs, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setCheck((previous) => {
        const rows = result.events.map((event) => ({ event, retained: false,
          requestedSlugs: result.resolvedSlugs.filter((mapping) => mapping.canonicalSlug === event.slug).map((mapping) => mapping.requestedSlug) }));
        const older = retain(previous.rows, new Set(result.unresolvedSlugs));
        // Alias changes may join a retained row to a fresh canonical row.
        for (const row of older) {
          const fresh = rows.find((candidate) => candidate.event.slug === row.event.slug);
          if (fresh) fresh.requestedSlugs.push(...row.requestedSlugs);
          else rows.push(row);
        }
        rows.sort((a, b) => Date.parse(a.event.starts_at) - Date.parse(b.event.starts_at));
        return { key, phase: "ready", rows, missing: result.missingSlugs, degraded: result.degraded };
      });
    }).catch(() => {
      if (!controller.signal.aborted) setCheck((previous) => ({ ...previous, key, phase: "unavailable", rows: retain(previous.rows, wanted), missing: [], degraded: true }));
    });
    return () => controller.abort();
  }, [key, mounted, attempt]);

  const currentIds = new Set(requested);
  const rows = check.rows.map((row) => ({ ...row, requestedSlugs: row.requestedSlugs.filter((slug) => currentIds.has(slug)) }))
    .filter((row) => row.requestedSlugs.length > 0);
  const listed = new Set(rows.flatMap((row) => row.requestedSlugs));
  const unlisted = requested.filter((slug) => !listed.has(slug));
  const checking = !mounted || check.key !== key || check.phase === "checking";
  const unverified = unlisted.filter((slug) => !check.missing.includes(slug));
  const overflow = Math.max(0, itineraryItems.length - requested.length);
  const mapEvents = rows.filter(({ event }) => event.attendance_mode !== "online" &&
    event.geom && Number.isFinite(event.geom.lng) && Number.isFinite(event.geom.lat))
    .map(({ event }) => ({ slug: event.slug, title: event.title, starts_at: event.starts_at,
      ends_at: event.ends_at, is_all_day: event.is_all_day, venue_name: event.venue_name,
      lng: event.geom.lng, lat: event.geom.lat, category: event.category, venue_place_slug: event.venue_place_slug }));
  const remove = (slugs: string[]) => {
    try { removeSavedReferences(slugs); setRemoveFailed(false); }
    catch { setRemoveFailed(true); }
  };

  if (mounted && itineraryItems.length === 0) return (
    <div className="flex flex-col items-center justify-center px-6 pb-12 pt-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--app-bg-sunken)]">
        <Calendar className="h-8 w-8 text-[var(--app-ink-3)]" aria-hidden />
      </div>
      <h1 className="mb-2 font-display text-xl font-bold text-[var(--app-ink)]">Your day plan is empty</h1>
      <p className="mb-6 max-w-sm text-[var(--app-ink-2)]">Add events to Day Plan to see them in time order or on a map.</p>
      <Link href="/events" className="inline-flex min-h-11 items-center rounded-full bg-[var(--app-ink)] px-6 font-semibold text-[var(--app-bg)]">See upcoming events</Link>
    </div>
  );

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] bg-[var(--app-bg)] px-4 py-4 md:px-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--app-ink)]">Day Plan</h1>
          <p className="text-sm text-[var(--app-ink-2)]">{mounted ? `${itineraryItems.length} saved ${itineraryItems.length === 1 ? "event" : "events"} · ${rows.length} listed` : "Opening your saved events…"}</p>
        </div>
        <div className="flex rounded-lg bg-[var(--app-bg-sunken)] p-1">
          {(["list", "map"] as const).map((mode) => (
            <button key={mode} onClick={() => setViewMode(mode)} disabled={!mounted} aria-pressed={viewMode === mode}
              className={`min-h-11 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-50 ${viewMode === mode ? "bg-[var(--app-bg)] text-[var(--app-ink)] shadow-sm" : "text-[var(--app-ink-2)]"}`}>{mode === "list" ? "Timeline" : "Map"}</button>
          ))}
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-4 md:px-6">
        <div role="status" className="text-sm text-[var(--app-ink-2)]">
          {checking ? "Checking saved events…" : check.phase === "unavailable" || check.degraded || unverified.length > 0 ? "Some saved events could not be checked. Your saved references are still on this device." : check.missing.length > 0 ? "Some saved events are no longer publicly listed. Your saved references are still on this device." : "Saved events are listed below."}
          {rows.some((row) => row.retained) && <p>Last-known events are shown. Check again before going.</p>}
        </div>
        {removeFailed && <p role="alert" className="text-sm text-[var(--app-ink-2)]">This device could not remove the saved reference. Try its remove button again.</p>}
        {mounted && <button onClick={() => setAttempt((value) => value + 1)} disabled={checking}
          className="min-h-11 rounded-lg border border-[var(--app-border)] px-4 text-sm font-semibold text-[var(--app-ink)] disabled:opacity-50">{checking ? "Checking…" : "Check again"}</button>}
        {overflow > 0 && <p className="text-sm text-[var(--app-ink-2)]">This check covers up to 100 event references. {overflow} other saved {overflow === 1 ? "reference is" : "references are"} kept on this device.</p>}
        {!checking && unlisted.map((slug, index) => (
          <div key={slug} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--app-border)] p-3">
            <p className="text-sm text-[var(--app-ink-2)]">{check.missing.includes(slug) ? "This event is no longer publicly listed." : "This saved event is unverified. Check again to try its listing."}</p>
            <button onClick={() => remove([slug])} aria-label={`Remove ${check.missing.includes(slug) ? "unlisted" : "unverified"} event ${index + 1} from Day Plan`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--app-ink-3)] hover:bg-[var(--app-bg-sunken)]"><Trash2 className="h-4 w-4" aria-hidden /></button>
          </div>
        ))}
      </div>
      {viewMode === "list" ? (
        <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4 pb-32 md:p-6">
          {checking && rows.length === 0 ? Array.from({ length: 3 }, (_, index) => <Skeleton.Block key={index} className="h-16 w-full rounded-lg" />) : (
            <div className="ml-4 space-y-8 border-l-2 border-[var(--app-border)] pl-6">
              {rows.map(({ event, requestedSlugs, retained }) => (
                <div key={event.slug} className="relative">
                  <div className="absolute -left-[35px] top-4 h-4 w-4 rounded-full border-2 border-[var(--app-bg)] bg-[var(--app-accent)] shadow-sm" />
                  {retained && <p className="mb-1 text-sm text-[var(--app-ink-2)]">Last-known event · not checked</p>}
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1"><EventCard event={event} variant="compact" /></div>
                    <button onClick={() => remove(requestedSlugs)} aria-label={`Remove ${event.title} from Day Plan`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full text-[var(--app-ink-3)] hover:bg-[var(--app-bg-sunken)]"><Trash2 className="h-4 w-4" aria-hidden /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="relative min-h-[500px] flex-1 bg-[var(--app-bg-sunken)]">
          {mapEvents.length > 0 ? <AppMapClient events={mapEvents} places={[]} fullBleed /> :
            <p className="p-6 text-sm text-[var(--app-ink-2)]">{checking ? "Checking event locations…" : "No checked event locations to show. Use Timeline to review your saved references."}</p>}
        </div>
      )}
    </div>
  );
}
