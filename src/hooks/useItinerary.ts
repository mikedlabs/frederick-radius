"use client";

import { useSyncExternalStore } from "react";
import { rememberListItem, restoreListItem, type RemovedListItem } from "@/lib/removed-list-item";

const KEY = "fr:itinerary:v1";
export type ItineraryItem = { id: string; added_at: string };
const listeners = new Set<() => void>();
const empty: ItineraryItem[] = [];
type DayPlanState = { items: ItineraryItem[]; status: "loading" | "unavailable" | "ready" };
const server: DayPlanState = { items: empty, status: "loading" };
let cachedRaw: string | null | undefined;
let cached: DayPlanState = server;

function readItems(): ItineraryItem[] {
  const raw = window.localStorage.getItem(KEY);
  if (cachedRaw === raw && cached.status === "ready") return cached.items;
  const items: unknown = raw === null ? [] : JSON.parse(raw);
  if (!Array.isArray(items) || items.some(item => typeof item?.id !== "string" || !item.id)) {
    throw new Error("This device's Day Plan could not be read.");
  }
  cachedRaw = raw;
  cached = { items, status: "ready" };
  return items;
}
function snapshot(): DayPlanState {
  try { readItems(); } catch {
    if (cached.status !== "unavailable") cached = { items: cached.items, status: "unavailable" };
  }
  return cached;
}
function publish() { listeners.forEach(listener => listener()); }
function onStorage(event: StorageEvent) {
  if (event.key === KEY || event.key === null) publish();
}
function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}
export function useDayPlan() {
  return useSyncExternalStore(subscribe, snapshot, () => server);
}
function write(items: ItineraryItem[]) {
  const raw = JSON.stringify(items);
  window.localStorage.setItem(KEY, raw);
  cachedRaw = raw;
  cached = { items, status: "ready" };
  publish();
}
function withDayPlan<T>(change: () => T): Promise<T> {
  return navigator.locks?.request ? navigator.locks.request(KEY, change) : Promise.resolve().then(change);
}
const itemId = (item: ItineraryItem) => item.id;
export function removeDayPlanEvent(id: string) {
  return withDayPlan(() => {
    const items = readItems();
    const index = items.findIndex(item => item.id === id);
    if (index < 0) return;
    const removed = rememberListItem(items, index, itemId);
    write(items.filter(item => item.id !== id));
    return removed;
  });
}
export function restoreDayPlanEvent(removed: RemovedListItem<ItineraryItem>) {
  return withDayPlan(() => {
    const items = readItems();
    const next = restoreListItem(items, removed, itemId);
    if (next !== items) write(next);
  });
}
