"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSavedList, useToggleSave, useIsSaved } from "@/hooks/useSaved";
import { track } from "@/lib/track";
import { createAbortDeadline, withDeadlineOutcome } from "@/lib/promise-deadline";
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
import {
  MAX_FOLLOWED_PLACES,
  normalizeFollowSlugs,
} from "@/lib/follows-contract";

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
 *        GET-then-write round trip. Completion waits for persistence;
 *        a failed write restores the last confirmed membership.
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

type FollowUser = { id: string; email: string | null };
type AuthState = "unknown" | "anonymous" | { user: FollowUser };

export type FollowedSlugsBootstrap = {
  /** Verified by the Server Component before this client tree is rendered. */
  user: FollowUser | null;
  /** Undefined means the bounded server read failed and the client must retry. */
  slugs?: readonly string[];
  /** Older rows remain stored but are outside the bounded UI snapshot. */
  truncated?: boolean;
};

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
let remoteStoreUserId: string | null = null;
let remoteStoreTruncated = false;
type FollowWriteQueue = {
  userId: string;
  slug: string;
  confirmed: boolean;
  latest: number;
  tail: Promise<void>;
  pending: number;
  uncertain: boolean;
  transport: { promise: Promise<Response>; outcome: "pending" | "response" | "rejected" } | null;
  reconciling: Promise<void> | null;
};
const followWrites = new Map<string, FollowWriteQueue>();
let followWriteEpoch = 0;
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

function writeAccountRemote(
  userId: string | null,
  next: Set<string> | null,
  truncated = false,
) {
  if (remoteStoreUserId !== userId) {
    followWriteEpoch++;
  }
  // A newer verified snapshot is also the rollback baseline for any pending
  // write. Never restore a pre-navigation value over an authoritative read.
  for (const queue of followWrites.values()) {
    if (queue.userId === userId && next !== null && (!truncated || next.has(queue.slug))) {
      queue.confirmed = next.has(queue.slug);
    }
  }
  remoteStoreUserId = userId;
  remoteStoreTruncated = Boolean(userId) && truncated;
  writeRemote(next);
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
let authGeneration = 0;

/**
 * Commit a verified Server Component snapshot to the browser store. This must
 * run from an effect, never during render: React may abandon a concurrent
 * render, and an abandoned tree must not mutate account-global module state.
 * A defined snapshot is authoritative even for the same account, so a soft
 * navigation observes cross-device unfollows rather than reviving stale state.
 */
function commitFollowBootstrap(bootstrap: FollowedSlugsBootstrap) {
  if (typeof window === "undefined") return;

  const auth: AuthState = bootstrap.user
    ? { user: bootstrap.user }
    : "anonymous";
  authGeneration++;
  authPromise = Promise.resolve(auth);

  if (!bootstrap.user) {
    writeAccountRemote(null, null);
    hydratePromise = null;
    hydrateUserId = null;
    return;
  }

  if (bootstrap.slugs === undefined) {
    // The server missed its deadline, so a previous same-account snapshot is
    // not proof of freshness. Keep the state honestly unknown and force the
    // bounded client retry instead of quietly treating stale rows as hydrated.
    writeAccountRemote(bootstrap.user.id, null);
    hydratePromise = null;
    hydrateUserId = null;
    return;
  }

  writeAccountRemote(
    bootstrap.user.id,
    new Set(normalizeFollowSlugs(bootstrap.slugs)),
    bootstrap.truncated,
  );
  hydrateUserId = null;
  hydratePromise = null;
}

function detectAuth(): Promise<AuthState> {
  if (!authPromise) {
    const request = fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((data: { user: { id: string; email: string | null } | null }) =>
        data.user ? ({ user: data.user } as AuthState) : "anonymous",
      )
      .catch(() => "anonymous" as AuthState);
    const lookup = withDeadlineOutcome(request, FOLLOW_WRITE_TIMEOUT_MS).then((result): AuthState => {
      if (authPromise !== lookup) return "unknown";
      if (result.status === "timed_out") {
        // Release only this lookup. A timeout is not anonymous identity, and a
        // late response must not replace a newer bootstrap or retry.
        authPromise = null;
        authGeneration++;
        return "unknown";
      }
      return result.status === "fulfilled" ? result.value : "unknown";
    });
    authPromise = lookup;
  }
  return authPromise;
}

/**
 * Hydrate the shared store from /api/follows exactly once per signed-in
 * session. Deduped via a module promise so simultaneous hook mounts
 * don't each fire the fetch.
 */
type HydrationResult = "hydrated" | "unauthorized" | "transient-error";
let hydratePromise: Promise<HydrationResult> | null = null;
let hydrateUserId: string | null = null;

function invalidateAuthForUser(userId: string) {
  if (remoteStoreUserId === userId) writeAccountRemote(null, null);
  authGeneration++;
  authPromise = null;
  hydratePromise = null;
  hydrateUserId = null;
}

function ensureRemoteHydrated(
  localSlugs: Set<string>,
  userId: string,
): Promise<HydrationResult> {
  if (remoteStoreUserId === userId && remoteStore !== null) {
    void maybeSync(localSlugs, remoteStore, userId);
    return Promise.resolve("hydrated");
  }
  if (hydratePromise && hydrateUserId === userId) {
    return hydratePromise;
  }

  // Account changes must never reuse another account's memberships or an
  // in-flight hydration promise.
  if (remoteStoreUserId !== userId) writeAccountRemote(userId, null);
  hydrateUserId = userId;
  const request = fetch("/api/follows", { cache: "no-store" })
    .then(async (response): Promise<HydrationResult> => {
      if (response.status === 401) {
        if (remoteStoreUserId === userId) invalidateAuthForUser(userId);
        return "unauthorized";
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as {
        slugs?: unknown;
        truncated?: unknown;
      };
      if (!Array.isArray(data.slugs)) throw new Error("invalid follows payload");
      if (remoteStoreUserId !== userId) return "hydrated";
      const set = new Set(normalizeFollowSlugs(data.slugs));
      writeAccountRemote(userId, set, data.truncated === true);
      // First-time sync: push any localStorage follows not yet remote.
      void maybeSync(localSlugs, set, userId);
      return "hydrated";
    })
    .catch((): HydrationResult => {
      // Unknown is not empty. Preserve the null/loading snapshot and release
      // the single-flight gate so this hook can retry without a hard reload.
      return "transient-error";
    })
    .finally(() => {
      if (hydratePromise === request) {
        hydratePromise = null;
        hydrateUserId = null;
      }
    });
  hydratePromise = request;
  return hydratePromise;
}

/** Hook-internal helper: list of slugs the user follows.
 *  Reads from the shared store when authed, localStorage when not. */
export function useFollowedSlugs(bootstrap?: FollowedSlugsBootstrap): {
  slugs: Set<string>;
  loading: boolean;
  authed: boolean;
  truncated: boolean;
} {
  const localList = useSavedList();
  const localSlugs = useMemo(
    () => new Set(localList.filter((i) => i.type === "place").map((i) => i.id)),
    [localList],
  );
  const bootstrapAuth: AuthState = bootstrap
    ? bootstrap.user
      ? { user: bootstrap.user }
      : "anonymous"
    : "unknown";
  const [auth, setAuth] = useState<AuthState>(bootstrapAuth);
  const bootstrapSlugs = useMemo(
    () =>
      bootstrap?.user && bootstrap.slugs !== undefined
        ? new Set(normalizeFollowSlugs(bootstrap.slugs))
        : null,
    [bootstrap],
  );
  const bootstrapKey = useMemo(() => {
    if (!bootstrap) return null;
    return JSON.stringify([
      bootstrap.user?.id ?? null,
      bootstrap.truncated === true,
      bootstrap.slugs === undefined
        ? null
        : normalizeFollowSlugs(bootstrap.slugs),
    ]);
  }, [bootstrap]);
  const [committedBootstrapKey, setCommittedBootstrapKey] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const remoteSlugs = useSyncExternalStore(subscribeRemote, readRemote, readServerRemote);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleTransientRetry = () => {
      if (cancelled) return;
      const delay = Math.min(1_000 * 2 ** retryAttempt, 15_000);
      retryTimer = setTimeout(() => {
        if (!cancelled) setRetryAttempt((attempt) => attempt + 1);
      }, delay);
    };

    const hydrate = async (a: AuthState) => {
      if (a === "anonymous" || a === "unknown") return;
      const result = await ensureRemoteHydrated(localSlugs, a.user.id);
      if (cancelled) return;
      if (result === "transient-error") {
        scheduleTransientRetry();
        return;
      }
      if (result !== "unauthorized") return;

      // The server rejected the cookie after the page snapshot was created.
      // Re-read identity instead of leaving the tab permanently "authed".
      const refreshed = await detectAuth();
      if (cancelled) return;
      setAuth(refreshed);
      if (refreshed !== "anonymous" && refreshed !== "unknown") {
        const retry = await ensureRemoteHydrated(localSlugs, refreshed.user.id);
        if (!cancelled && retry === "transient-error") scheduleTransientRetry();
      }
    };

    if (bootstrap) {
      const verified: AuthState = bootstrap.user
        ? { user: bootstrap.user }
        : "anonymous";
      commitFollowBootstrap(bootstrap);
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setCommittedBootstrapKey(bootstrapKey);
        setAuth(verified);
      });
      if (bootstrap.user && bootstrap.slugs === undefined) void hydrate(verified);
    } else {
      void detectAuth().then((detected) => {
        if (cancelled) return;
        setAuth(detected);
        if (detected === "unknown") scheduleTransientRetry();
        else void hydrate(detected);
      });
    }
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [bootstrap, bootstrapKey, localSlugs, retryAttempt]);

  // A newly arrived server payload wins immediately. Once that payload has
  // committed, live auth state wins so a later 401 can demote the tab instead
  // of leaving a stale server prop permanently labelled authenticated.
  const activeAuth =
    bootstrap && committedBootstrapKey !== bootstrapKey
      ? bootstrapAuth
      : auth;
  if (activeAuth === "unknown") {
    // Pre-detect: render the localStorage view so the UI doesn't
    // flicker. Once auth settles, it'll either stay the same (anon)
    // or replace with the DB view (signed in).
    return { slugs: localSlugs, loading: true, authed: false, truncated: false };
  }
  if (activeAuth === "anonymous") {
    return { slugs: localSlugs, loading: false, authed: false, truncated: false };
  }
  const accountRemoteSlugs =
    remoteStoreUserId === activeAuth.user.id ? remoteSlugs : null;
  const bootstrapAwaitingCommit =
    bootstrapSlugs !== null && committedBootstrapKey !== bootstrapKey;
  const slugs = bootstrapAwaitingCommit
    ? bootstrapSlugs
    : accountRemoteSlugs ?? bootstrapSlugs ?? localSlugs;
  return {
    slugs,
    loading: accountRemoteSlugs === null && bootstrapSlugs === null,
    authed: true,
    truncated: bootstrapAwaitingCommit
      ? bootstrap?.truncated === true
      : remoteStoreUserId === activeAuth.user.id
        ? remoteStoreTruncated
        : bootstrap?.truncated === true,
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

export const FOLLOW_WRITE_TIMEOUT_MS = 15_000;
const UNCONFIRMED = "We could not confirm this change. Please try again.";
const CHANGED_LIST = "Your saved list changed while we checked your account. Check this place and try again.";
const PENDING_WRITE = "This change is still pending. Wait for it to finish before making another change to this place.";
const UNKNOWN_WRITE = "The connection ended before this change could be confirmed. Refresh Saved to check your list.";
const CHECKING_WRITE = "Your saved list must be checked before another change to this place can be made. Please wait, then try again.";

/** Set one membership without overwriting unrelated optimistic saves. */
function writeFollowMembership(slug: string, followed: boolean) {
  const next = new Set(remoteStore ?? []);
  if (followed) next.add(slug);
  else next.delete(slug);
  writeRemote(next);
}

function releaseFollowQueue(queue: FollowWriteQueue) {
  const key = JSON.stringify([queue.userId, queue.slug]);
  if (queue.pending === 0 && !queue.uncertain && !queue.transport && followWrites.get(key) === queue) {
    followWrites.delete(key);
  }
}

/** A cancelled read is safe; a cancelled mutation is not proof of rollback. */
async function readFollowMembership(slug: string): Promise<boolean> {
  const deadline = createAbortDeadline(FOLLOW_WRITE_TIMEOUT_MS);
  let onAbort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new DOMException("Saved lookup timed out", "AbortError"));
    deadline.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const payload = await Promise.race([
      fetch("/api/follows", { cache: "no-store", signal: deadline.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Saved lookup failed");
          return response.json() as Promise<{ slugs?: unknown; truncated?: unknown }>;
        }),
      interrupted,
    ]);
    if (!Array.isArray(payload.slugs)) throw new Error("Invalid saved list");
    const followed = normalizeFollowSlugs(payload.slugs).includes(slug);
    if (!followed && payload.truncated === true) throw new Error("Saved membership unresolved");
    return followed;
  } finally {
    deadline.signal.removeEventListener("abort", onAbort);
    deadline.dispose();
  }
}

/** Only an actual HTTP outcome plus a fresh same-account read releases a hold. */
function reconcileFollowQueue(queue: FollowWriteQueue): Promise<void> {
  if (queue.reconciling) return queue.reconciling;
  const transport = queue.transport;
  if (!queue.uncertain || transport?.outcome !== "response" || remoteStoreUserId !== queue.userId) {
    return Promise.resolve();
  }
  const epoch = followWriteEpoch;
  const generation = authGeneration;
  const reconcile = readFollowMembership(queue.slug)
    .then((followed) => {
      if (followWriteEpoch !== epoch || authGeneration !== generation || remoteStoreUserId !== queue.userId || queue.transport !== transport) return;
      queue.confirmed = followed;
      queue.uncertain = false;
      queue.transport = null;
      writeFollowMembership(queue.slug, followed);
      releaseFollowQueue(queue);
    })
    .catch(() => {
      // A failed observation does not establish the mutation's final state.
    })
    .finally(() => {
      if (queue.reconciling === reconcile) queue.reconciling = null;
    });
  queue.reconciling = reconcile;
  return reconcile;
}

function followFailureCopy(queue: FollowWriteQueue): string {
  return queue.transport?.outcome === "pending" ? PENDING_WRITE
    : queue.transport?.outcome === "rejected" ? UNKNOWN_WRITE
      : CHECKING_WRITE;
}

/**
 * Serialize confirmed writes, while keeping uncertainty separate from the UI
 * deadline. Never abort a mutation and assume the server did not commit it.
 * A held place refuses further writes until its real response and observation
 * settle; other places remain independent. This is a document-local barrier,
 * not a server ordering fence across refreshes or lost connections.
 */
function persistFollowToggle(
  userId: string,
  slug: string,
  wasFollowed: boolean,
  source: string,
  onFailure?: (description: string) => void,
): Promise<boolean> {
  const key = JSON.stringify([userId, slug]);
  let queue = followWrites.get(key);
  if (!queue) {
    queue = { userId, slug, confirmed: wasFollowed, latest: 0, tail: Promise.resolve(), pending: 0, uncertain: false, transport: null, reconciling: null };
    followWrites.set(key, queue);
  }
  const activeQueue = queue;
  const revision = ++activeQueue.latest;
  activeQueue.pending++;
  const epoch = followWriteEpoch;
  const followed = !wasFollowed;
  const isCurrentAccount = () => followWriteEpoch === epoch && remoteStoreUserId === userId;
  const fail = () => {
    if (isCurrentAccount() && activeQueue.latest === revision) writeFollowMembership(slug, activeQueue.confirmed);
    onFailure?.(activeQueue.uncertain ? followFailureCopy(activeQueue) : UNCONFIRMED);
    return wasFollowed;
  };
  const operation = activeQueue.tail.then(async () => {
    try {
      if (!isCurrentAccount()) return fail();
      if (activeQueue.uncertain) {
        void reconcileFollowQueue(activeQueue);
        return fail();
      }
      let sent = false;
      const transport = {
        promise: Promise.resolve().then(() => {
          // Identity may change between the queue turn and this microtask.
          if (!isCurrentAccount()) throw new Error("Saved account changed");
          sent = true;
          return fetch("/api/follows", {
            method: followed ? "POST" : "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(followed ? { slug, source } : { slug }),
          });
        }),
        outcome: "pending" as "pending" | "response" | "rejected",
      };
      activeQueue.transport = transport;
      void transport.promise.then(() => {
        transport.outcome = "response";
        if (activeQueue.transport === transport && activeQueue.uncertain) void reconcileFollowQueue(activeQueue);
      }, () => { transport.outcome = "rejected"; });
      const result = await withDeadlineOutcome(transport.promise, FOLLOW_WRITE_TIMEOUT_MS);
      if (activeQueue.transport !== transport) return fail();
      if (!sent) {
        activeQueue.transport = null;
        return fail();
      }
      if (result.status !== "fulfilled" || !result.value.ok || !isCurrentAccount()) {
        activeQueue.uncertain = true;
        void reconcileFollowQueue(activeQueue);
        return fail();
      }
      activeQueue.transport = null;
      activeQueue.confirmed = followed;
      if (activeQueue.latest === revision) writeFollowMembership(slug, followed);
      track("save_place", { on: followed, source, synced: true });
      if (shouldCancelPlaceReturnBridgeAfterDelete(wasFollowed, remoteStore, slug)) {
        cancelPendingReturnBridgeValue("place");
      } else if (followed && remoteStore?.has(slug)) {
        signalReturnBridgeValue("place");
      }
      if (remoteStore?.has(slug) === followed) void syncFollowPushTopic(slug, followed);
      return followed;
    } finally {
      activeQueue.pending--;
      releaseFollowQueue(activeQueue);
    }
  });
  activeQueue.tail = operation.then(() => {}, () => {});
  return operation;
}

/** A settled unchanged result means failure; discard callers stay compatible. */
export function useToggleFollow(slug: string, source?: string, onFailure?: (description: string) => void) {
  const localToggle = useToggleSave("place", slug);
  return useCallback(async (): Promise<boolean> => {
    const generation = authGeneration;
    const startedFollowed = remoteStore?.has(slug) ?? readIsSavedSync(slug);
    const auth = await detectAuth();
    // An old identity lookup cannot mutate a new account or its local saves.
    // Normal first hydration does not change this auth generation.
    if (authGeneration !== generation) {
      onFailure?.(UNCONFIRMED);
      return startedFollowed;
    }
    if (auth === "anonymous" || auth === "unknown") {
      localToggle();
      const on = readIsSavedSync(slug);
      track("save_place", { on, source: source ?? "place_detail", synced: false });
      return on;
    }
    const current = remoteStoreUserId === auth.user.id && remoteStore
      ? remoteStore
      : new Set<string>();
    // The tap belongs to the list the person saw. If account discovery
    // changes that membership, refuse rather than sending the opposite action.
    if (current.has(slug) !== startedFollowed) {
      onFailure?.(CHANGED_LIST);
      return startedFollowed;
    }
    const { next, wasFollowed } = toggleSlug(current, slug);
    if (!wasFollowed && next.size > MAX_FOLLOWED_PLACES) return false;
    if (remoteStoreUserId !== auth.user.id) writeAccountRemote(auth.user.id, current);
    writeRemote(next);
    return persistFollowToggle(auth.user.id, slug, wasFollowed, source ?? "place_detail", onFailure);
  }, [slug, source, localToggle, onFailure]);
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
  // Local saves are stored oldest-first. Send newest-first so the bounded
  // account import keeps the person's most recent, most relevant choices.
  const toUpload = [...localSlugs]
    .reverse()
    .filter((s) => !remoteSlugs.has(s))
    .slice(0, MAX_FOLLOWED_PLACES);
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
      const data = (await res.json()) as { acceptedSlugs?: unknown };
      setSyncedFlag(userId);
      // Fold the just-synced slugs into the shared store so the UI
      // reflects them without waiting for a remount.
      const merged = new Set(remoteStore ?? remoteSlugs);
      const accepted = Array.isArray(data.acceptedSlugs)
        ? normalizeFollowSlugs(data.acceptedSlugs)
        : [];
      accepted.forEach((slug) => merged.add(slug));
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
  followWriteEpoch++;
  // Pending/unknown server writes remain held even if this account signs out.
  for (const queue of followWrites.values()) releaseFollowQueue(queue);
  authGeneration++;
  authPromise = null;
  hydratePromise = null;
  hydrateUserId = null;
  writeAccountRemote(null, null);
}
