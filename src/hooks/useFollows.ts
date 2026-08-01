"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSavedList, useToggleSave, useIsSaved } from "@/hooks/useSaved";
import { track } from "@/lib/track";
import { businessTopic } from "@/lib/push-topics";
import {
  cancelPendingReturnBridgeValue,
  signalReturnBridgeValue,
} from "@/lib/return-bridge";
import {
  clearFollowsSync,
  hasCompletedFollowsSync,
  markFollowsSyncComplete,
} from "@/lib/follows-sync";

/**
 * useFollows — auth-aware follow state for places.
 *
 * The contract:
 *   - When the user is signed out: falls through to the existing
 *     localStorage `useSaved` API. The /my-radius experience stays
 *     identical to what /saved was yesterday.
 *   - When the user is signed in: reads/writes via /api/follows so
 *     the list lives in the DB and syncs across devices.
 *
 * Shared store + optimistic writes (the premium-feel path):
 *   Authed follow slugs live in ONE module-level store, mirrored into
 *   React via useSyncExternalStore — the same pattern useSaved uses.
 *   That buys two things the previous component-state design couldn't:
 *     1. A toggle in any control (the place-page CTA, an icon button,
 *        a card) updates EVERY follow control on screen at once.
 *     2. The toggle flips the store immediately and reconciles with
 *        the server in the background, so there's no spinner and no
 *        GET-then-write round trip. A failed write reverts the flip.
 *   The previous design re-rendered only the button that was tapped
 *   and left every other `useFollowedSlugs()` reader showing stale
 *   membership until the page remounted.
 *
 * One-shot localStorage -> DB sync: the first time we detect (signed
 * in + non-empty localStorage), POST the cache to /api/follows/sync.
 * Subsequent renders for that account don't re-sync (an account-scoped
 * flag stored in localStorage prevents repeated imports). Idempotent on
 * the server side via the unique index, so an existing user can safely
 * repeat the import once when migrating off the old device-wide flag.
 *
 * Why a hook and not React Query / SWR? The app doesn't ship a
 * client-side data-fetching library; introducing one for this single
 * feature is overkill. The shared store covers the cross-component
 * consistency a cache library would otherwise provide.
 *
 * Events + Radii continue to use useSaved directly — only the place
 * follow path goes through the DB. The product framing in the brief
 * is "follow PLACES"; events stay device-local.
 */

type AuthState = "unknown" | "anonymous" | { user: { id: string; email: string | null } };

function getSyncedFlag(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return hasCompletedFollowsSync(window.localStorage, userId);
  } catch {
    return false;
  }
}
function setSyncedFlag(userId: string) {
  if (typeof window === "undefined") return;
  try {
    markFollowsSyncComplete(window.localStorage, userId);
  } catch {
    /* ignore */
  }
}
function clearSyncedFlag(userId: string) {
  if (typeof window === "undefined") return;
  try {
    clearFollowsSync(window.localStorage, userId);
  } catch {
    /* ignore */
  }
}

/**
 * Pure helper: return the follow set with `slug` toggled, plus whether
 * it was followed before the toggle. Never mutates the input set — the
 * optimistic path and the revert path both rely on the original
 * staying intact. Exported for unit tests.
 */
export function toggleSlug(
  set: Set<string>,
  slug: string,
): { next: Set<string>; wasFollowed: boolean } {
  const wasFollowed = set.has(slug);
  const next = new Set(set);
  if (wasFollowed) next.delete(slug);
  else next.add(slug);
  return { next, wasFollowed };
}

export function shouldCancelPlaceReturnBridgeAfterDelete(
  wasFollowed: boolean,
  live: ReadonlySet<string> | null,
  slug: string,
): boolean {
  return (
    wasFollowed
    && live !== null
    && !live.has(slug)
    && live.size === 0
  );
}

/* ----------------------------------------------------------------------
 * Shared remote-follow store. `null` means "not yet hydrated from
 * /api/follows" (distinct from "hydrated and empty"). Reads return a
 * stable reference between writes so useSyncExternalStore's Object.is
 * check doesn't loop.
 * -------------------------------------------------------------------- */
let remoteStore: Set<string> | null = null;
const remoteListeners = new Set<() => void>();
function readRemote(): Set<string> | null {
  return remoteStore;
}
function readServerRemote(): Set<string> | null {
  return null;
}
function writeRemote(next: Set<string> | null) {
  remoteStore = next;
  remoteListeners.forEach((l) => l());
}
const subscribeRemote = (cb: () => void) => {
  remoteListeners.add(cb);
  return () => {
    remoteListeners.delete(cb);
  };
};

/**
 * Detects auth state once on mount. We hit /api/auth/me which is
 * the lightweight "who am I?" endpoint. Result cached in module
 * state for the page lifetime so multiple useFollows() callers
 * don't issue duplicate requests.
 */
let authPromise: Promise<AuthState> | null = null;
function detectAuth(): Promise<AuthState> {
  if (!authPromise) {
    authPromise = fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((data: { user: { id: string; email: string | null } | null }) =>
        data.user ? ({ user: data.user } as AuthState) : "anonymous",
      )
      .catch(() => "anonymous" as AuthState);
  }
  return authPromise;
}

/**
 * Hydrate the shared store from /api/follows exactly once per signed-in
 * session. Deduped via a module promise so simultaneous hook mounts
 * don't each fire the fetch.
 */
let hydratePromise: Promise<void> | null = null;
function ensureRemoteHydrated(localSlugs: Set<string>, userId: string): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = fetch("/api/follows", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { slugs: [] }))
    .then((data: { slugs: string[] }) => {
      const set = new Set(data.slugs);
      writeRemote(set);
      // First-time sync: push any localStorage follows not yet remote.
      void maybeSync(localSlugs, set, userId);
    })
    .catch(() => {
      writeRemote(new Set());
    });
  return hydratePromise;
}

/** Hook-internal helper: list of slugs the user follows.
 *  Reads from the shared store when authed, localStorage when not. */
export function useFollowedSlugs(): {
  slugs: Set<string>;
  loading: boolean;
  authed: boolean;
} {
  const localList = useSavedList();
  const localSlugs = useMemo(
    () => new Set(localList.filter((i) => i.type === "place").map((i) => i.id)),
    [localList],
  );
  const [auth, setAuth] = useState<AuthState>("unknown");
  const remoteSlugs = useSyncExternalStore(subscribeRemote, readRemote, readServerRemote);

  useEffect(() => {
    let cancelled = false;
    void detectAuth().then((a) => {
      if (cancelled) return;
      setAuth(a);
      if (a === "anonymous" || a === "unknown") return;
      void ensureRemoteHydrated(localSlugs, a.user.id);
    });
    return () => {
      cancelled = true;
    };
  }, [localSlugs]);

  if (auth === "unknown") {
    // Pre-detect: render the localStorage view so the UI doesn't
    // flicker. Once auth settles, it'll either stay the same (anon)
    // or replace with the DB view (signed in).
    return { slugs: localSlugs, loading: true, authed: false };
  }
  if (auth === "anonymous") {
    return { slugs: localSlugs, loading: false, authed: false };
  }
  return {
    slugs: remoteSlugs ?? localSlugs,
    loading: remoteSlugs === null,
    authed: true,
  };
}

/** Lightweight "is this slug followed?" check. */
export function useIsFollowed(slug: string): boolean {
  const { slugs, authed } = useFollowedSlugs();
  // When anonymous, delegate to the existing useIsSaved to match the
  // legacy contract exactly (the localList read is identical, but
  // useIsSaved also handles the hydration window).
  const localIsSaved = useIsSaved("place", slug);
  if (!authed) return localIsSaved;
  return slugs.has(slug);
}

/**
 * Mirror a place follow into the DEVICE's push topics, so a claimed business
 * can later reach the people who followed it via the `biz:<slug>` channel
 * (push-topics.ts). push_subscriptions is device-keyed (no user_id), so the
 * server-side follow write can't find the subscription — this runs client-side
 * against the device's own subscription through the existing /api/push/topics
 * merge endpoint.
 *
 * Consent is respected automatically: if this device has no push subscription
 * (the user never granted notifications), getSubscription() is null and we do
 * nothing — we never call subscribe(), so no permission prompt is forced. We
 * subscribe on EVERY follow (not just already-claimed places): the claim can
 * happen after the follow, and the publish side is what gates on a verified
 * owner, so an unclaimed `biz:<slug>` simply never fires. Best-effort and
 * fire-and-forget — a failed topic sync must never affect the follow itself.
 */
async function syncFollowPushTopic(slug: string, follow: boolean): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return; // no notification consent on this device → nothing to wire
    const topic = businessTopic(slug);
    await fetch("/api/push/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        follow
          ? { endpoint: sub.endpoint, add: [topic] }
          : { endpoint: sub.endpoint, remove: [topic] },
      ),
    });
  } catch {
    /* best-effort side channel; never surface or block the follow */
  }
}

/** Toggle a follow for a place. Returns the new state (true = followed). */
export function useToggleFollow(slug: string, source?: string) {
  const localToggle = useToggleSave("place", slug);
  return useCallback(async (): Promise<boolean> => {
    const auth = await detectAuth();
    if (auth === "anonymous" || auth === "unknown") {
      // localStorage path (legacy)
      localToggle();
      const on = readIsSavedSync(slug);
      track("save_place", { on, source: source ?? "place_detail", synced: false });
      return on;
    }
    // Authed path: optimistic. Flip the shared store immediately so
    // every follow control re-renders to the new state with no spinner
    // and no read-before-write round trip, then reconcile with the
    // server in the background. A failed write reverts the flip.
    const current = remoteStore ?? new Set<string>();
    const { next, wasFollowed } = toggleSlug(current, slug);
    writeRemote(next);
    track("save_place", { on: !wasFollowed, source: source ?? "place_detail", synced: true });

    void fetch("/api/follows", {
      method: wasFollowed ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        wasFollowed ? { slug } : { slug, source: source ?? "place_detail" },
      ),
    })
      .then((r) => {
        if (!r.ok) throw new Error("follow write failed");
        if (
          shouldCancelPlaceReturnBridgeAfterDelete(
            wasFollowed,
            remoteStore,
            slug,
          )
        ) {
          cancelPendingReturnBridgeValue("place");
        } else if (!wasFollowed && remoteStore?.has(slug)) {
          signalReturnBridgeValue("place");
        }
        // Only mirror the push topic once the follow actually persisted, so a
        // reverted (failed) follow never leaves a dangling biz:<slug> topic.
        void syncFollowPushTopic(slug, !wasFollowed);
      })
      .catch(() => {
        // Revert to pre-toggle membership against the LATEST store
        // value (another toggle may have landed meanwhile).
        const live = remoteStore ?? new Set<string>();
        const reverted = new Set(live);
        if (wasFollowed) reverted.add(slug);
        else reverted.delete(slug);
        writeRemote(reverted);
      });

    return !wasFollowed;
  }, [slug, source, localToggle]);
}

/** Module-level read of "is slug saved locally" — used by the toggle's
 *  return value when in anonymous mode. */
function readIsSavedSync(slug: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem("fr:saved:v1");
    if (!raw) return false;
    const list = JSON.parse(raw) as Array<{ type: string; id: string }>;
    return list.some((i) => i.type === "place" && i.id === slug);
  } catch {
    return false;
  }
}

/**
 * If logged in and we have localStorage place-saves that aren't yet
 * in the remote set, POST them to /api/follows/sync. Marks a flag so
 * subsequent renders don't re-sync. Idempotent on the server.
 */
async function maybeSync(localSlugs: Set<string>, remoteSlugs: Set<string>, userId: string) {
  if (getSyncedFlag(userId)) return;
  const toUpload = [...localSlugs].filter((s) => !remoteSlugs.has(s));
  if (toUpload.length === 0) {
    setSyncedFlag(userId);
    return;
  }
  try {
    const res = await fetch("/api/follows/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: toUpload }),
    });
    if (res.ok) {
      setSyncedFlag(userId);
      // Fold the just-synced slugs into the shared store so the UI
      // reflects them without waiting for a remount.
      const merged = new Set(remoteStore ?? remoteSlugs);
      toUpload.forEach((s) => merged.add(s));
      writeRemote(merged);
    }
  } catch {
    /* try again next mount */
  }
}

/** Exported for the sign-out path to reset session caches so a
 *  different account on the same device starts fresh instead of
 *  showing the previous session's follow set. */
export function resetFollowsSyncFlag(userId?: string) {
  if (userId) clearSyncedFlag(userId);
  authPromise = null;
  hydratePromise = null;
  writeRemote(null);
}
