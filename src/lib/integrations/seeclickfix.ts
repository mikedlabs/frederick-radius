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

export async function getFixItIssues(limit = 20): Promise<FixItIssue[]> {
  const url = `${ENDPOINT}?place_url=${PLACE_URL}&per_page=${limit}&sort=created_at&sort_direction=DESC`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json() as { issues?: RawIssue[] };
    const issues = data.issues ?? [];
    // Defensive: even scoped, never let an out-of-county point render.
    return filterToCounty(issues)
      .map((i) => ({
        id: i.id,
        summary: i.summary,
        description: (i.description ?? "").slice(0, 200),
        address: i.address ?? "",
        lng: i.lng,
        lat: i.lat,
        status: normStatus(i.status),
        status_raw: i.status,
        category: i.request_type?.title ?? "Issue",
        reported_at: i.created_at,
        url: i.url,
        html_url: i.html_url,
      }));
  } catch {
    return [];
  }
}
