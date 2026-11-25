export const BACKUP_FORMAT = "frederick-radius-backup";
export const BACKUP_VERSION = 1;

const prefixes = ["fr:", "fr.", "fr-"];
const isAppKey = (key: string) => prefixes.some((prefix) => key.startsWith(prefix));

export function collectBackup(storage: Storage) {
  const data: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !isAppKey(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return data;
}

export function readBackup(text: string): Record<string, string> | null {
  const file = JSON.parse(text);
  if (!file || file.format !== BACKUP_FORMAT || !file.data || typeof file.data !== "object" || Array.isArray(file.data)) return null;
  // Earlier backups can omit the version. Version 1 uses the same string map.
  if (file.version !== undefined && file.version !== BACKUP_VERSION) return null;
  const entries = Object.entries(file.data).filter((item): item is [string, string] => isAppKey(item[0]) && typeof item[1] === "string");
  return entries.length ? Object.fromEntries(entries) : null;
}

export function reviewBackup(storage: Storage, data: Record<string, string>) {
  const entries = Object.entries(data).map(([key, value]) => ({ key, value, before: storage.getItem(key) }));
  const added = entries.filter(({ before }) => before === null).length;
  const replaced = entries.filter(({ before, value }) => before !== null && before !== value).length;
  return { data, entries, added, replaced, unchanged: entries.length - added - replaced };
}

export type BackupReview = ReturnType<typeof reviewBackup>;

export function applyBackup(storage: Storage, review: BackupReview) {
  const written: BackupReview["entries"] = [];
  try {
    // Another tab may have saved something since the visitor reviewed the file.
    // Show the updated counts and require a fresh confirmation in that case.
    if (review.entries.some(({ key, before }) => storage.getItem(key) !== before)) {
      return { status: "changed", review: reviewBackup(storage, review.data) } as const;
    }
    for (const entry of review.entries) {
      if (entry.before === entry.value) continue;
      storage.setItem(entry.key, entry.value);
      written.push(entry);
    }
    return { status: "restored" } as const;
  } catch {
    // Each setItem is atomic. Undo successful writes in reverse order so a
    // quota failure can return to the same space usage as each prior step.
    let complete = true;
    for (const entry of written.reverse()) {
      try {
        if (storage.getItem(entry.key) !== entry.value) {
          // Preserve a newer change made by another tab during the restore.
          complete = false;
          continue;
        }
        if (entry.before === null) storage.removeItem(entry.key);
        else storage.setItem(entry.key, entry.before);
      } catch {
        complete = false;
      }
    }
    return { status: complete ? "storage-error" : "rollback-error" } as const;
  }
}
