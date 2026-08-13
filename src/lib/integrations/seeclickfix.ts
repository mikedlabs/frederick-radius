/**
 * SeeClickFix — Frederick County FCG FixIT (Open311).
 * Free, public API. Returns recent 311 reports for Frederick County.
 *
 * Endpoint: https://seeclickfix.com/api/v2/issues
 * No key required for public read-only access.
 */

const ENDPOINT = "https://seeclickfix.com/api/v2/issues";

// SeeClickFix v2 silently IGNORES a bbox-only query and returns the
// GLOBAL recent feed (Las Vegas, Toledo, etc. shown under a Frederick
// header). Scope the request to the canonical place instead —
// confirmed via the /places API: "Frederick County" => url_name
// "frederick-county" (id 72540).
const PLACE_URL = "frederick-county";

// Frederick County bounding box: south, west, north, east.
const BBOX_S = 39.265;
const BBOX_W = -77.7;
const BBOX_N = 39.745;
const BBOX_E = -77.15;

/** True only when a point falls inside the Frederick County bbox. */
export function inFrederickBbox(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= BBOX_S &&
    lat <= BBOX_N &&
    lng >= BBOX_W &&
    lng <= BBOX_E
  );
}

/**
 * Belt-and-suspenders post-filter. Even with the place-scoped URL, if
 * the upstream silently regresses again the UI must not show
 * out-of-county 311. Pure, so it is unit tested.
 */
export function filterToCounty<T extends { lat: number; lng: number }>(
  rows: T[],
): T[] {
  return rows.filter((r) => inFrederickBbox(r.lat, r.lng));
}

export type FixItIssue = {
  id: number;
  summary: string;
  description: string;
  address: string;
  lng: number;
  lat: number;
  status: "open" | "acknowledged" | "closed";
  status_raw: string;
  category: string;
  reported_at: string;
  url: string;
  html_url: string;
};

/**
 * A successful empty read and a failed read are different facts. Consumers
 * that make a public status claim must use this result instead of treating an
 * empty array as proof that no requests are active.
 *
 * `data` contains only requests that can still be useful to a resident:
 * unacknowledged open requests and requests the County has acknowledged. A
 * closed request never appears on a live map or under an "open" label.
 */
export type FixItIssuesResult = {
  data: FixItIssue[];
  open: FixItIssue[];
  acknowledged: FixItIssue[];
  openCount: number;
  acknowledgedCount: number;
  openAvailable: boolean;
  acknowledgedAvailable: boolean;
  status: "current" | "partial" | "unavailable";
  available: boolean;
};

/** Compact public label that never turns an incomplete read into a zero. */
export function fixItCountLabel(
  result: Pick<
    FixItIssuesResult,
    | "status"
    | "openCount"
    | "acknowledgedCount"
    | "openAvailable"
    | "acknowledgedAvailable"
  >,
): string {
  if (result.status === "unavailable") return "Reports unavailable";
  const knownCount =
    (result.openAvailable ? result.openCount : 0) +
    (result.acknowledgedAvailable ? result.acknowledgedCount : 0);
  if (result.status === "current" && knownCount === 0) {
    return "No active reports";
  }
  return [
    result.openAvailable
      ? `${result.openCount} open`
      : "Open count unavailable",
    result.acknowledgedAvailable
      ? `${result.acknowledgedCount} acknowledged`
      : "Acknowledged count unavailable",
  ].join(" · ");
}

type RawIssue = {
  id: number;
  summary: string;
  description?: string;
  address?: string;
  lng: number;
  lat: number;
  status: string;
  request_type?: { title?: string };
  reporter?: { name?: string };
  created_at: string;
  url: string;
  html_url: string;
};

function normStatus(s: string): FixItIssue["status"] {
  const l = s.toLowerCase();
  if (l.includes("close")) return "closed";
  if (l.includes("ack") || l.includes("progress")) return "acknowledged";
  return "open";
}

function unavailableResult(): FixItIssuesResult {
  return {
    data: [],
    open: [],
    acknowledged: [],
    openCount: 0,
    acknowledgedCount: 0,
    openAvailable: false,
    acknowledgedAvailable: false,
    status: "unavailable",
    available: false,
  };
}

type StatusRead = {
  available: boolean;
  issues: FixItIssue[];
  total: number;
};

function normalizeIssues(issues: RawIssue[]): FixItIssue[] {
  return filterToCounty(issues).map((issue) => ({
    id: issue.id,
    summary: issue.summary,
    description: (issue.description ?? "").slice(0, 200),
    address: issue.address ?? "",
    lng: issue.lng,
    lat: issue.lat,
    status: normStatus(issue.status),
    status_raw: issue.status,
    category: issue.request_type?.title ?? "Issue",
    reported_at: issue.created_at,
    url: issue.url,
    html_url: issue.html_url,
  }));
}

async function readStatus(status: "open" | "acknowledged"): Promise<StatusRead> {
  const url = `${ENDPOINT}?place_url=${PLACE_URL}&per_page=20&sort=created_at&sort_direction=DESC&status=${status}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return { available: false, issues: [], total: 0 };
    const payload = await res.json() as {
      issues?: RawIssue[];
      metadata?: { pagination?: { entries?: unknown } };
    };
    const normalized = normalizeIssues(payload.issues ?? []).filter(
      (issue) => issue.status === status,
    );
    const rawTotal = payload.metadata?.pagination?.entries;
    const total = typeof rawTotal === "number" && Number.isFinite(rawTotal)
      ? Math.max(normalized.length, Math.trunc(rawTotal))
      : normalized.length;
    return { available: true, issues: normalized, total };
  } catch {
    return { available: false, issues: [], total: 0 };
  }
}

/**
 * Health-aware FCG FixIT read. The unfiltered endpoint mixes open,
 * acknowledged, and closed requests in one recent list. Read the two active
 * states separately so a run of recently closed records can never erase an
 * older request that remains open.
 */
export async function getFixItIssuesResult(
  limit = 20,
): Promise<FixItIssuesResult> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 20));
  const [openRead, acknowledgedRead] = await Promise.all([
    readStatus("open"),
    readStatus("acknowledged"),
  ]);
  if (!openRead.available && !acknowledgedRead.available) {
    return unavailableResult();
  }

  const data = [...openRead.issues, ...acknowledgedRead.issues]
    .sort(
      (left, right) =>
        Date.parse(right.reported_at) - Date.parse(left.reported_at),
    )
    .slice(0, safeLimit);
  const visibleIds = new Set(data.map((issue) => issue.id));
  const current = openRead.available && acknowledgedRead.available;
  return {
    data,
    open: openRead.issues.filter((issue) => visibleIds.has(issue.id)),
    acknowledged: acknowledgedRead.issues.filter((issue) => visibleIds.has(issue.id)),
    openCount: openRead.total,
    acknowledgedCount: acknowledgedRead.total,
    openAvailable: openRead.available,
    acknowledgedAvailable: acknowledgedRead.available,
    status: current ? "current" : "partial",
    available: current,
  };
}

/** Backward-compatible active-request list for map and deck callers. */
export async function getFixItIssues(limit = 20): Promise<FixItIssue[]> {
  return (await getFixItIssuesResult(limit)).data;
}
