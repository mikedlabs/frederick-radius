/**
 * The local-place import marker must be scoped to the signed-in account.
 *
 * A device-wide marker lets the first account that signs in suppress the
 * import for every later account on that browser. The server import is
 * idempotent, so moving existing users from the legacy device-wide marker to
 * an account key is safe: each account may repeat the import once.
 */
const FOLLOW_IMPORT_KEY_PREFIX = "fr:radius:synced:v2";

type SyncStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function followsSyncKey(userId: string): string {
  return `${FOLLOW_IMPORT_KEY_PREFIX}:${encodeURIComponent(userId.trim())}`;
}

export function hasCompletedFollowsSync(storage: SyncStorage, userId: string): boolean {
  return storage.getItem(followsSyncKey(userId)) === "1";
}

export function markFollowsSyncComplete(storage: SyncStorage, userId: string): void {
  storage.setItem(followsSyncKey(userId), "1");
}

export function clearFollowsSync(storage: SyncStorage, userId: string): void {
  storage.removeItem(followsSyncKey(userId));
}
