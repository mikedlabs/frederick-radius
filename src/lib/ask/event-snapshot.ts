import "server-only";
import {
  loadEventArchiveSnapshot,
  publicEventArchiveSourceHealth,
  type EventArchiveSourceHealth,
} from "@/lib/loaders/todayEventSnapshot";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { AskAction } from "./contracts";
import { parseScope, scopeToParam } from "@/lib/scope";

export const ASK_EVENT_SNAPSHOT_TIMEOUT_MS = 1_500;
export type AskEventSnapshot = {
  publicEvents: EventWithMeta[];
  sourceHealth: EventArchiveSourceHealth;
};

/** One durable calendar for Ask's ordinary search, parking lookup and optional
 * event tool. The archive reader owns cancellation, curated offline fallback,
 * and public reason codes. This never starts publisher or geocoder work. */
export async function loadAskEventSnapshot(now = new Date()): Promise<AskEventSnapshot> {
  try {
    const snapshot = await loadEventArchiveSnapshot(now, { timeoutMs: ASK_EVENT_SNAPSHOT_TIMEOUT_MS });
    return {
      publicEvents: snapshot.publicEvents,
      sourceHealth: publicEventArchiveSourceHealth(snapshot.sourceHealth),
    };
  } catch {
    // Unexpected reader failures cannot become a successful empty calendar or
    // leak a driver message. Normal no-DB/timeout paths retain curated rows.
    return {
      publicEvents: [],
      sourceHealth: publicEventArchiveSourceHealth(undefined),
    };
  }
}

type CalendarAnswer = { answer: string | null; actions?: AskAction[] };
/** Keep coverage visible through the existing answer/actions contract. Event
 * verification remains a per-record decision, separate from collection health. */
export function withAskEventCoverage<T extends CalendarAnswer>(
  result: T,
  sourceHealth: Pick<EventArchiveSourceHealth, "degraded"> | undefined,
  municipality?: string | null,
): T {
  if (!sourceHealth?.degraded) return result;
  const qualification = "I could not fully verify the event calendar.";
  const answer = result.answer?.startsWith(qualification)
    ? result.answer : [qualification, result.answer].filter(Boolean).join(" ");
  const actions = [...(result.actions ?? [])];
  if (!actions.some(action => action.kind === "open" && /^\/events(?:[?#]|$)/.test(action.href))) {
    const scope = parseScope(municipality);
    const href = scope ? `/events?in=${encodeURIComponent(scopeToParam(scope))}` : "/events";
    // Preserve concrete routes, including access help and an identified event.
    // A recovery route is more useful than an optional refinement when full.
    const refinement = actions.findIndex(action => action.kind === "refine");
    if (actions.length >= 3 && refinement >= 0) actions.splice(refinement, 1);
    if (actions.length < 3) actions.push({ label: "Open the event calendar", kind: "open", href });
  }
  return { ...result, answer, actions };
}
