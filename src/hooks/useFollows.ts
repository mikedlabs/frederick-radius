"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useIsSaved, useSavedList, useToggleSave } from "@/hooks/useSaved";

type User = { id: string; email: string | null };
type AuthState = "unknown" | "anonymous" | "offline" | { user: User };
type FollowStatus = "checking" | "synced" | "offline" | "anonymous";
type RemotePhase = "idle" | "loading" | "synced" | "offline";
type Listener = () => void;

const LEGACY_SYNCED_KEY = "fr:radius:synced:v1";
const SYNCED_KEY_PREFIX = "fr:radius:synced:v2";
const LOCAL_SAVED_KEY = "fr:saved:v1";
const AUTH_RETRY_MS = 15_000;
const SYNC_BATCH_SIZE = 500;

function syncedKey(userId: string): string {
  return `${SYNCED_KEY_PREFIX}:${userId}`;
}

function localSlugsSignature(slugs: Set<string>): string {
  return JSON.stringify([...slugs].sort());
}

function getSyncedSignature(userId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    // Neither v1 marker can prove which exact local set reached the account.
    // Remove them once, then use the content-aware v2 signature below.
    window.localStorage.removeItem(LEGACY_SYNCED_KEY);
    window.localStorage.removeItem(`${LEGACY_SYNCED_KEY}:${userId}`);
    return window.localStorage.getItem(syncedKey(userId));
  } catch {
    return null;
  }
}

function setSyncedSignature(userId: string, signature: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(syncedKey(userId), signature);
    window.localStorage.removeItem(LEGACY_SYNCED_KEY);
    window.localStorage.removeItem(`${LEGACY_SYNCED_KEY}:${userId}`);
  } catch {
    // A disabled/full localStorage should not make following fail.
  }
}

function clearSyncedFlag(userId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (userId) {
      window.localStorage.removeItem(syncedKey(userId));
      window.localStorage.removeItem(`${LEGACY_SYNCED_KEY}:${userId}`);
    }
    window.localStorage.removeItem(LEGACY_SYNCED_KEY);
  } catch {
    // Ignore unavailable localStorage.
  }
}

/* -------------------------------------------------------------------------- */
/* Shared auth store                                                           */
/* -------------------------------------------------------------------------- */

let storeGeneration = 0;
let authSnapshot: AuthState = "unknown";
let authPromise: Promise<AuthState> | null = null;
let authCheckedAt = 0;
const authListeners = new Set<Listener>();

function publishAuth(next: AuthState) {
  if (Object.is(next, authSnapshot)) return;
  authSnapshot = next;
  authListeners.forEach((listener) => listener());
}

function subscribeAuth(listener: Listener) {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

function getAuthSnapshot() {
  return authSnapshot;
}

function getServerAuthSnapshot(): AuthState {
  return "unknown";
}

/** One browser-page-wide auth lookup shared by every mounted save control. */
function detectAuth(): Promise<AuthState> {
  if (authPromise) {
    const offlineRetryIsDue =
      authSnapshot === "offline" && Date.now() - authCheckedAt >= AUTH_RETRY_MS;
    if (!offlineRetryIsDue) return authPromise;
    authPromise = null;
  }

  const generation = storeGeneration;
  authCheckedAt = Date.now();
  const request = fetch("/api/auth/me", { cache: "no-store" })
    .then(async (response): Promise<AuthState> => {
      if (!response.ok) return "offline";

      const data = (await response.json()) as { user?: Partial<User> | null };
      if (!data.user) return "anonymous";
      if (typeof data.user.id !== "string") return "offline";

      return {
        user: {
          id: data.user.id,
          email: typeof data.user.email === "string" ? data.user.email : null,
        },
      };
    })
    .catch(() => "offline" as const)
    .then((next) => {
      if (generation === storeGeneration) publishAuth(next);
      return generation === storeGeneration ? next : authSnapshot;
    });

  authPromise = request;
  return request;
}

/* -------------------------------------------------------------------------- */
/* Shared remote-follow store                                                  */
/* -------------------------------------------------------------------------- */

type RemoteSnapshot = {
  slugs: Set<string>;
  confirmedSlugs: Set<string>;
  phase: RemotePhase;
};

let serverSlugs = new Set<string>();
let importedSlugs = new Set<string>();
let remoteSnapshot: RemoteSnapshot = {
  slugs: new Set(),
  confirmedSlugs: new Set(),
  phase: "idle",
};
let remoteFetchPromise: Promise<void> | null = null;
let syncPromise: Promise<boolean> | null = null;
let mutationSequence = 0;
let confirmedMutationRevision = 0;
const pendingMutations = new Map<string, { id: number; followed: boolean }>();
const confirmedMutations = new Map<
  string,
  { revision: number; followed: boolean }
>();
const mutationQueues = new Map<string, Promise<unknown>>();
const remoteListeners = new Set<Listener>();

function composeRemoteSlugs(): Set<string> {
  const slugs = new Set(serverSlugs);
  importedSlugs.forEach((slug) => slugs.add(slug));
  pendingMutations.forEach(({ followed }, slug) => {
    if (followed) slugs.add(slug);
    else slugs.delete(slug);
  });
  return slugs;
}

function publishRemote(phase: RemotePhase = remoteSnapshot.phase) {
  remoteSnapshot = {
    slugs: composeRemoteSlugs(),
    confirmedSlugs: new Set(serverSlugs),
    phase,
  };
  remoteListeners.forEach((listener) => listener());
}

function subscribeRemote(listener: Listener) {
  remoteListeners.add(listener);
  return () => remoteListeners.delete(listener);
}

function getRemoteSnapshot() {
  return remoteSnapshot;
}

const SERVER_REMOTE_SNAPSHOT: RemoteSnapshot = {
  slugs: new Set<string>(),
  confirmedSlugs: new Set<string>(),
  phase: "idle",
};

function getServerRemoteSnapshot() {
  return SERVER_REMOTE_SNAPSHOT;
}

/** At most one GET can be active, regardless of the number of cards mounted. */
function loadRemoteFollows(): Promise<void> {
  if (remoteSnapshot.phase === "synced") return Promise.resolve();
  if (remoteFetchPromise) return remoteFetchPromise;

  const generation = storeGeneration;
  const startingMutationRevision = confirmedMutationRevision;
  publishRemote("loading");

  const request = fetch("/api/follows", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load follows (${response.status})`);
      const data = (await response.json()) as { slugs?: unknown };
      if (!Array.isArray(data.slugs)) throw new Error("Invalid follows response");
      const slugs = data.slugs.filter(
        (slug): slug is string => typeof slug === "string",
      );

      if (generation !== storeGeneration) return;
      serverSlugs = new Set(slugs);
      // A write can finish after this GET began but before its older response
      // arrives. Reapply those confirmed writes so stale read timing cannot
      // undo a successful tap.
      confirmedMutations.forEach(({ revision, followed }, slug) => {
        if (revision <= startingMutationRevision) return;
        if (followed) serverSlugs.add(slug);
        else serverSlugs.delete(slug);
      });
      // Imported and optimistic values are composed on top, so an older GET
      // response cannot briefly undo a save made while the request was active.
      publishRemote("synced");
    })
    .catch(() => {
      if (generation === storeGeneration) {
        // Preserve every cached/imported slug on failure.
        publishRemote("offline");
      }
    })
    .finally(() => {
      if (remoteFetchPromise === request) remoteFetchPromise = null;
    });

  remoteFetchPromise = request;
  return request;
}

/**
 * Import device-local place saves once per account session. The local slugs
 * enter the shared cache before the request, so every SaveButton agrees
 * immediately. The endpoint is idempotent, which makes retrying all local
 * slugs safer than relying on an unconfirmed client-side diff.
 */
function readLocalPlaceSlugs(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(LOCAL_SAVED_KEY);
    if (!raw) return new Set();
    const list = JSON.parse(raw) as Array<{ type?: unknown; id?: unknown }>;
    if (!Array.isArray(list)) return new Set();
    return new Set(
      list
        .filter(
          (item): item is { type: "place"; id: string } =>
            item?.type === "place" && typeof item.id === "string",
        )
        .map((item) => item.id.trim())
        .filter((slug) => slug.length > 0 && slug.length <= 120),
    );
  } catch {
    return new Set();
  }
}

function maybeSync(userId: string): Promise<boolean> {
  // Always read at the last responsible moment. The initial remote GET can be
  // in flight while a user removes a local place; using an effect's older Set
  // here would let the additive import resurrect that just-removed place.
  const localSlugs = readLocalPlaceSlugs();
  const signature = localSlugsSignature(localSlugs);
  if (getSyncedSignature(userId) === signature) return Promise.resolve(true);
  if (syncPromise) {
    // A local save can arrive while an earlier batch is still in flight. Once
    // that batch settles, compare the newer content again so nothing is lost.
    return syncPromise.then(() => maybeSync(userId));
  }

  importedSlugs = new Set([...importedSlugs, ...localSlugs]);
  publishRemote();

  if (localSlugs.size === 0) {
    setSyncedSignature(userId, signature);
    return Promise.resolve(true);
  }

  const generation = storeGeneration;
  const slugs = [...localSlugs];
  const request = (async () => {
    // The route intentionally caps one request at 500 values. Send bounded
    // batches so a very large Radius is never marked synced after truncation.
    for (let index = 0; index < slugs.length; index += SYNC_BATCH_SIZE) {
      const response = await fetch("/api/follows/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: slugs.slice(index, index + SYNC_BATCH_SIZE) }),
      });
      if (!response.ok) {
        throw new Error(`Unable to sync follows (${response.status})`);
      }
    }

    return true;
  })()
    .then(() => {
      if (generation !== storeGeneration) return false;

      localSlugs.forEach((slug) => serverSlugs.add(slug));
      setSyncedSignature(userId, signature);
      publishRemote(
        remoteSnapshot.phase === "loading"
          ? "loading"
          : remoteSnapshot.phase === "offline"
            ? "offline"
            : "synced",
      );
      return true;
    })
    .catch(() => {
      if (generation === storeGeneration) publishRemote("offline");
      return false;
    })
    .finally(() => {
      if (syncPromise === request) syncPromise = null;
    });

  syncPromise = request;
  return request;
}

type MutationResult = { ok: boolean; followed: boolean };

/**
 * Optimistically set one remote follow. Requests for the same slug are sent
 * in tap order, while the latest optimistic intent remains visible.
 */
function setRemoteFollowed(
  slug: string,
  followed: boolean,
  source?: string,
): Promise<MutationResult> {
  const id = ++mutationSequence;
  const generation = storeGeneration;
  pendingMutations.set(slug, { id, followed });
  publishRemote();

  const previousRequest = mutationQueues.get(slug) ?? Promise.resolve();
  const request = previousRequest
    .catch(() => undefined)
    .then(async (): Promise<MutationResult> => {
      if (generation !== storeGeneration) return { ok: false, followed: false };
      // Let a first-login import finish before a removal, otherwise its POST
      // could arrive after the DELETE and resurrect the place remotely.
      if (!followed && syncPromise) await syncPromise;
      if (generation !== storeGeneration) return { ok: false, followed: false };

      let ok = false;
      try {
        const response = await fetch("/api/follows", {
          method: followed ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            ...(followed ? { source: source ?? "place_detail" } : {}),
          }),
        });
        ok = response.ok;
      } catch {
        ok = false;
      }

      if (generation !== storeGeneration) return { ok: false, followed: false };

      if (ok) {
        confirmedMutationRevision += 1;
        confirmedMutations.set(slug, {
          revision: confirmedMutationRevision,
          followed,
        });
        if (followed) serverSlugs.add(slug);
        else {
          serverSlugs.delete(slug);
          importedSlugs.delete(slug);
        }
      }

      const latest = pendingMutations.get(slug);
      if (latest?.id === id) pendingMutations.delete(slug);
      // On failure, removing this optimistic override reveals the prior
      // server/imported membership: that is the rollback.
      publishRemote(ok ? remoteSnapshot.phase : "offline");
      return { ok, followed: composeRemoteSlugs().has(slug) };
    })
    .finally(() => {
      if (mutationQueues.get(slug) === request) mutationQueues.delete(slug);
    });

  mutationQueues.set(slug, request);
  return request;
}

function readLocalPlaceSaved(slug: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(LOCAL_SAVED_KEY);
    if (!raw) return false;
    const list = JSON.parse(raw) as Array<{ type?: unknown; id?: unknown }>;
    return Array.isArray(list) && list.some((item) => item.type === "place" && item.id === slug);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Public hooks                                                                */
/* -------------------------------------------------------------------------- */

export function useFollowedSlugs(): {
  slugs: Set<string>;
  accountSlugs: Set<string>;
  loading: boolean;
  authed: boolean;
  status: FollowStatus;
} {
  const localList = useSavedList();
  const localSlugs = useMemo(
    () => new Set(localList.filter((item) => item.type === "place").map((item) => item.id)),
    [localList],
  );
  const auth = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getServerAuthSnapshot,
  );
  const remote = useSyncExternalStore(
    subscribeRemote,
    getRemoteSnapshot,
    getServerRemoteSnapshot,
  );

  useEffect(() => {
    let active = true;
    void detectAuth().then((nextAuth) => {
      if (!active || typeof nextAuth === "string") return;
      // Establish the server baseline before importing device-local additions.
      // Otherwise an older GET could arrive after the import and temporarily
      // overwrite the set we just confirmed on the server.
      void loadRemoteFollows().then(() => {
        if (active) void maybeSync(nextAuth.user.id);
      });
    });
    return () => {
      active = false;
    };
  }, [localSlugs]);

  const signedInSlugs = useMemo(() => {
    const union = new Set(localSlugs);
    remote.slugs.forEach((slug) => union.add(slug));
    return union;
  }, [localSlugs, remote.slugs]);

  if (auth === "unknown") {
    return {
      slugs: localSlugs,
      accountSlugs: new Set(),
      loading: true,
      authed: false,
      status: "checking",
    };
  }
  if (auth === "anonymous") {
    return {
      slugs: localSlugs,
      accountSlugs: new Set(),
      loading: false,
      authed: false,
      status: "anonymous",
    };
  }
  if (auth === "offline") {
    return {
      slugs: localSlugs,
      accountSlugs: new Set(),
      loading: false,
      authed: false,
      status: "offline",
    };
  }

  const loading = remote.phase === "idle" || remote.phase === "loading";
  return {
    slugs: signedInSlugs,
    accountSlugs: remote.confirmedSlugs,
    loading,
    authed: true,
    status:
      remote.phase === "offline" ? "offline" : loading ? "checking" : "synced",
  };
}

export function useIsFollowed(slug: string): boolean {
  const { slugs, authed } = useFollowedSlugs();
  const localIsSaved = useIsSaved("place", slug);
  return authed ? slugs.has(slug) : localIsSaved;
}

/** Toggle a place follow and resolve to the actual state after the request. */
export function useToggleFollow(slug: string, source?: string) {
  const localToggle = useToggleSave("place", slug);

  return useCallback(async (): Promise<boolean> => {
    const auth = await detectAuth();
    if (typeof auth === "string") {
      // Anonymous and auth-offline users keep the proven local-only flow.
      return localToggle();
    }

    const localWasSaved = readLocalPlaceSaved(slug);
    const currentlyFollowed = localWasSaved || remoteSnapshot.slugs.has(slug);
    const nextFollowed = !currentlyFollowed;

    // A local save participates in the signed-in union. Remove it alongside
    // an optimistic DELETE so it cannot mask the UI update; restore on error.
    if (!nextFollowed && localWasSaved) localToggle();

    const result = await setRemoteFollowed(slug, nextFollowed, source);
    if (!result.ok && localWasSaved && !readLocalPlaceSaved(slug)) {
      localToggle();
    }

    return readLocalPlaceSaved(slug) || remoteSnapshot.slugs.has(slug);
  }, [localToggle, slug, source]);
}

/** Idempotently apply a follow after an auth redirect; never toggles it off. */
export async function ensureFollowed(slug: string, source = "post_signin"): Promise<boolean> {
  const auth = await detectAuth();
  if (typeof auth === "string") return false;

  if (
    remoteSnapshot.phase === "synced" &&
    serverSlugs.has(slug) &&
    pendingMutations.get(slug)?.followed !== false
  ) {
    return true;
  }

  const result = await setRemoteFollowed(slug, true, source);
  return result.ok || remoteSnapshot.slugs.has(slug);
}

/** Clear account-scoped module state when signing out/switching accounts. */
export function resetFollowsSyncFlag() {
  const userId = typeof authSnapshot === "string" ? null : authSnapshot.user.id;
  clearSyncedFlag(userId);
  storeGeneration += 1;

  authPromise = null;
  authCheckedAt = 0;
  publishAuth("unknown");

  serverSlugs = new Set();
  importedSlugs = new Set();
  pendingMutations.clear();
  confirmedMutations.clear();
  confirmedMutationRevision = 0;
  mutationSequence = 0;
  mutationQueues.clear();
  remoteFetchPromise = null;
  syncPromise = null;
  publishRemote("idle");
}
