/**
 * SeeClickFix — Frederick County FCG FixIT (Open311).
 * Free, public API. Returns recent 311 reports inside the county bbox.
 *
 * Endpoint: https://seeclickfix.com/api/v2/issues
 * No key required for public read-only access.
 */

const ENDPOINT = "https://seeclickfix.com/api/v2/issues";

// Frederick County bbox: south, west, north, east
const BBOX = "39.265,-77.700,39.745,-77.150";

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
  const url = `${ENDPOINT}?bbox=${BBOX}&per_page=${limit}&sort=created_at&sort_direction=DESC`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json() as { issues?: RawIssue[] };
    const issues = data.issues ?? [];
    return issues
      .filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng))
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
