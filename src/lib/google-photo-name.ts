/**
 * Request-time Google photo identity for /api/place-photo.
 *
 * Stored `places/{id}/photos/{token}` names expire. Place IDs do not. The
 * proxy asks Place Details for the current main/first photo, keeps that name
 * in a short process cache, and refuses to re-fetch a name Google already
 * rejected until Details returns a different one. Photo bytes are still
 * fetched per request and never stored.
 */
import {
  currentPlacePhotoName,
  placeIdFromPhotoName,
  type CurrentPlacePhotoNameResult,
} from "@/lib/integrations/google-places";

export const FRESH_PLACE_PHOTO_NAME_TTL_MS = 15 * 60 * 1_000;

type CachedName = {
  name: string | null;
  expiresAt: number;
};

const freshNames = new Map<string, CachedName>();
const inflight = new Map<string, Promise<CurrentPlacePhotoNameResult>>();
const rejectedReasons = new Map<string, string>();

export function resetGooglePhotoNameStateForTests(): void {
  freshNames.clear();
  inflight.clear();
  rejectedReasons.clear();
}

export function rememberRejectedPhotoName(name: string, reason: string): void {
  const trimmed = name.trim();
  const label = reason.trim();
  if (!trimmed || !label) return;
  rejectedReasons.set(trimmed, label);
}

export function isRejectedPhotoName(name: string): boolean {
  return rejectedReasons.has(name);
}

export function rejectedPhotoNameReason(name: string): string | undefined {
  return rejectedReasons.get(name);
}

export async function resolveFreshPlacePhotoName(
  storedName: string,
  options?: { signal?: AbortSignal; now?: number },
): Promise<string | null> {
  const result = await lookupFreshPlacePhotoName(storedName, options);
  return result.status === "found" ? result.name : null;
}

export async function resolvePlacePhotoMediaName(
  storedName: string,
  options?: { signal?: AbortSignal; now?: number },
): Promise<{ name: string } | { name: null; reason: string }> {
  const fresh = await resolveFreshPlacePhotoName(storedName, options);
  const ordered = fresh && fresh !== storedName ? [fresh, storedName] : [fresh ?? storedName];
  const candidate = ordered.find((name) => name && !isRejectedPhotoName(name));
  if (candidate) return { name: candidate };
  const rejected = ordered.find((name) => name && isRejectedPhotoName(name));
  return {
    name: null,
    reason: (rejected && rejectedPhotoNameReason(rejected)) || "upstream-400",
  };
}

async function lookupFreshPlacePhotoName(
  storedName: string,
  options?: { signal?: AbortSignal; now?: number },
): Promise<CurrentPlacePhotoNameResult> {
  const placeId = placeIdFromPhotoName(storedName);
  if (!placeId) return { status: "unavailable" };

  const now = options?.now ?? Date.now();
  const cached = freshNames.get(placeId);
  if (cached && cached.expiresAt > now) {
    return cached.name
      ? { status: "found", name: cached.name }
      : { status: "empty" };
  }

  const pending = inflight.get(placeId);
  if (pending) return pending;

  const lookup = currentPlacePhotoName(placeId, { signal: options?.signal })
    .then((result) => {
      if (result.status === "found") {
        freshNames.set(placeId, {
          name: result.name,
          expiresAt: Date.now() + FRESH_PLACE_PHOTO_NAME_TTL_MS,
        });
      } else if (result.status === "empty") {
        freshNames.set(placeId, {
          name: null,
          expiresAt: Date.now() + FRESH_PLACE_PHOTO_NAME_TTL_MS,
        });
      }
      return result;
    })
    .finally(() => {
      inflight.delete(placeId);
    });

  inflight.set(placeId, lookup);
  return lookup;
}
