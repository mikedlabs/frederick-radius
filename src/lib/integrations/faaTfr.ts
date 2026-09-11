/**
 * FAA temporary flight restrictions — the Camp David signal.
 *
 * Frederick County contains P-40, the permanently restricted airspace over
 * Camp David (Thurmont). When the President visits, the FAA issues an
 * EXPANDED TFR — public record, near-real-time, and the quiet explanation
 * for the helicopters and road activity Thurmont notices before any news
 * breaks. tfr.faa.gov exposes the active list as open JSON (verified live:
 * ~237 rows of {notam_id, type, state, description}).
 *
 * Voice caution (by design): this is presented as AIRSPACE status, never
 * presidential tracking — "the Camp David airspace ring is expanded today."
 * Renders nothing almost every day; that rarity is the feature. Fail-soft.
 */
const API = "https://tfr.faa.gov/tfrapi/exportTfrList";

export type CampDavidTfr = {
  notamId: string;
  description: string;
};

type Raw = { notam_id?: string; type?: string; state?: string; description?: string };

const NEARBY = /thurmont|camp david|sabillasville|emmitsburg|catoctin|frederick,? md/i;

export async function getCampDavidTfr(): Promise<CampDavidTfr | null> {
  try {
    const res = await fetch(API, {
      headers: { accept: "application/json" },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Raw[];
    if (!Array.isArray(rows)) return null;
    const hit = rows.find(
      (r) => r.state === "MD" && r.type?.toUpperCase() === "SECURITY" && NEARBY.test(r.description ?? ""),
    );
    return hit?.notam_id
      ? { notamId: hit.notam_id, description: (hit.description ?? "").trim() }
      : null;
  } catch {
    return null;
  }
}
