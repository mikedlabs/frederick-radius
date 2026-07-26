const ASK_RETURN_KEY_PREFIX = "fr:ask:return:v1:";
const ASK_RETURN_HISTORY_KEY = "__frAskReturn";

/** Long enough for a detail-page visit, but short enough that time-sensitive
 * answers such as "open now" are not silently revived much later. */
export const ASK_RETURN_TTL_MS = 15 * 60 * 1_000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type AskReturnFailure = "network" | "rate-limit" | "service";

export type AskReturnSnapshot<TResult> = {
  version: 1;
  id: string;
  savedAt: number;
  query: string;
  draft: string;
  submittedQuery: string;
  permalinkQuery: string;
  result: TResult;
  requestFailure: AskReturnFailure | null;
  showAllSources: boolean;
  scope: string | null;
  scrollY: number;
  clickedSourceIndex: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function snapshotKey(id: string): string {
  return `${ASK_RETURN_KEY_PREFIX}${id}`;
}

export function createAskReturnId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Add Radius's marker without discarding Next's private history fields.
 * Those fields are required for an App Router Back navigation to work.
 */
export function historyStateWithAskReturn(
  state: unknown,
  id: string,
): Record<string, unknown> {
  const current = isRecord(state) ? state : {};
  return { ...current, [ASK_RETURN_HISTORY_KEY]: id };
}

export function readAskReturnId(state: unknown): string | null {
  if (!isRecord(state)) return null;
  const id = state[ASK_RETURN_HISTORY_KEY];
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function writeAskReturnSnapshot<TResult>(
  storage: StorageLike,
  snapshot: AskReturnSnapshot<TResult>,
): boolean {
  try {
    storage.setItem(snapshotKey(snapshot.id), JSON.stringify(snapshot));
    return true;
  } catch {
    // Storage can be unavailable in strict privacy modes. Navigation should
    // still proceed normally; only the enhanced Back restoration is skipped.
    return false;
  }
}

export function readAskReturnSnapshot<TResult>(
  storage: StorageLike,
  historyState: unknown,
  expectedQuery: string,
  now = Date.now(),
): AskReturnSnapshot<TResult> | null {
  const id = readAskReturnId(historyState);
  if (!id) return null;

  const key = snapshotKey(id);
  let parsed: unknown;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  const savedAt = parsed.savedAt;
  const query = parsed.query;
  const clickedSourceIndex = parsed.clickedSourceIndex;
  const requestFailure = parsed.requestFailure;
  const result = parsed.result;
  const validFailure =
    requestFailure === null ||
    requestFailure === "network" ||
    requestFailure === "rate-limit" ||
    requestFailure === "service";
  const validSourceIndex =
    clickedSourceIndex === null ||
    (typeof clickedSourceIndex === "number" &&
      Number.isInteger(clickedSourceIndex) &&
      clickedSourceIndex >= 0);

  const valid =
    parsed.version === 1 &&
    parsed.id === id &&
    typeof savedAt === "number" &&
    Number.isFinite(savedAt) &&
    savedAt <= now + 60_000 &&
    now - savedAt <= ASK_RETURN_TTL_MS &&
    typeof query === "string" &&
    query.trim() === expectedQuery.trim() &&
    typeof parsed.draft === "string" &&
    typeof parsed.submittedQuery === "string" &&
    typeof parsed.permalinkQuery === "string" &&
    isRecord(result) &&
    validFailure &&
    typeof parsed.showAllSources === "boolean" &&
    (parsed.scope === null || typeof parsed.scope === "string") &&
    typeof parsed.scrollY === "number" &&
    Number.isFinite(parsed.scrollY) &&
    parsed.scrollY >= 0 &&
    validSourceIndex;

  if (!valid) {
    try {
      storage.removeItem(key);
    } catch {
      // Best-effort cleanup only.
    }
    return null;
  }

  return parsed as AskReturnSnapshot<TResult>;
}
