"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSavedList, useToggleSave, useIsSaved } from "@/hooks/useSaved";

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
 * One-shot localStorage → DB sync: the first time we detect (signed
 * in + non-empty localStorage), POST the cache to /api/follows/sync.
 * Subsequent renders don't re-sync (a flag stored in localStorage
 * prevents repeated imports). Idempotent on the server side via
 * the unique index, so a flag-clearing user can re-sync safely.
 *
 * Why a hook and not React Query / SWR? The app doesn't ship a
 * client-side data-fetching library; introducing one for this single
 * feature is overkill. The cache lives in component state, refreshed
 * on the mount that follows a successful follow/unfollow.
 *
 * Events + Radii continue to use useSaved directly — only the place
 * follow path goes through the DB. The product framing in the brief
 * is "follow PLACES"; events stay device-local.
 */

type AuthState = "unknown" | "anonymous" | { user: { id: string; email: string | null } };

const SYNCED_KEY = "fr:radius:synced:v1";

function getSyncedFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SYNCED_KEY) === "1";
  } catch {
    return false;
  }
}
function setSyncedFlag() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SYNCED_KEY, "1");
  } catch {
    /* ignore */
  }
}
function clearSyncedFlag() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SYNCED_KEY);
  } catch {
    /* ignore */
  }
}

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

/** Hook-internal helper: list of slugs the user follows.
 *  Reads from API when authed, localStorage when not. */
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
  const [remoteSlugs, setRemoteSlugs] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void detectAuth().then((a) => {
      if (cancelled) return;
      setAuth(a);
      if (a === "anonymous" || a === "unknown") return;
      // Authed: hydrate from /api/follows.
      void fetch("/api/follows", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { slugs: [] }))
        .then((data: { slugs: string[] }) => {
          if (cancelled) return;
          setRemoteSlugs(new Set(data.slugs));
          // First-time sync: if there are localStorage follows that
          // aren't yet in the remote set, push them up.
          void maybeSync(localSlugs, new Set(data.slugs));
        })
        .catch(() => {
          if (cancelled) return;
          setRemoteSlugs(new Set());
        });
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

/** Toggle a follow for a place. Returns the new state (true = followed). */
export function useToggleFollow(slug: string, source?: string) {
  const localToggle = useToggleSave("place", slug);
  const [, force] = useState({});
  return useCallback(async (): Promise<boolean> => {
    const auth = await detectAuth();
    if (auth === "anonymous" || auth === "unknown") {
      // localStorage path (legacy)
      localToggle();
      return readIsSavedSync(slug);
    }
    // Authed path: optimistic API call.
    const currentlyFollowed = await fetch("/api/follows", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { slugs: [] }))
      .then((d: { slugs: string[] }) => new Set(d.slugs).has(slug))
      .catch(() => false);
    if (currentlyFollowed) {
      await fetch("/api/follows", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      force({});
      return false;
    }
    await fetch("/api/follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, source: source ?? "place_detail" }),
    });
    force({});
    return true;
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
async function maybeSync(localSlugs: Set<string>, remoteSlugs: Set<string>) {
  if (getSyncedFlag()) return;
  const toUpload = [...localSlugs].filter((s) => !remoteSlugs.has(s));
  if (toUpload.length === 0) {
    setSyncedFlag();
    return;
  }
  try {
    const res = await fetch("/api/follows/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: toUpload }),
    });
    if (res.ok) setSyncedFlag();
  } catch {
    /* try again next mount */
  }
}

/** Exported for the sign-out path to reset the sync flag so a
 *  different account on the same device starts fresh. */
export function resetFollowsSyncFlag() {
  clearSyncedFlag();
}
