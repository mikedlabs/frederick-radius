import type { Metadata } from "next";
import ReportClient from "./ReportClient";

/**
 * /report — the public "Report something" flow (community layer, Phase 1).
 *
 * Anyone past the beta wall can drop a hazard / condition / tip / note on the
 * map. A trusted submitter (passcode) publishes instantly; everyone else's
 * report queues for /admin review. Mirrors /collect's focused full-screen field
 * UI; submissions go to /api/reports.
 *
 * noindex — it's an input tool, not content.
 */
export const metadata: Metadata = {
  title: "Mark a spot · Frederick Radius",
  description: "Mark a hazard, a live condition, or a local tip on the Frederick County map.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Parse the map's `?c=lng,lat,zoom` camera param (written by AppMap) so the
 *  "Mark a spot" FAB can carry the user's current view into /report. Bad/absent
 *  values fall through to null (ReportClient then geolocates as before). */
function parseCamera(c: string | undefined): { longitude: number; latitude: number; zoom: number } | null {
  if (!c) return null;
  const [lng, lat, z] = c.split(",").map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { longitude: lng, latitude: lat, zoom: Number.isFinite(z) ? z : 16 };
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  return <ReportClient initialCamera={parseCamera(c)} />;
}
