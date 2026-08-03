import { NextResponse } from "next/server";
import {
  isOperationalEventResolutionError,
  resolveEventPageBySlug,
} from "@/lib/loaders/eventResolver";

export const revalidate = 300;

/**
 * One event by the same bounded resolver as the full detail page. The durable
 * archive, seed catalog, and source-specific fallback must agree with the page:
 * a sheet cannot say 404 for a link whose full detail route is valid.
 *
 * Exists for the sheet system's on-demand path: lean surfaces (/today,
 * /live-music) deliberately keep the event corpus out of their client
 * payload, so a tap there fetches just the one tapped event instead of
 * shipping hundreds up front. Shares the five-minute cache horizon of
 * the pages themselves.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const resolved = await resolveEventPageBySlug(slug);
    if (!resolved) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(
      { event: resolved.event },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
    );
  } catch (error) {
    // A timeout or incomplete provider set is not proof that the shared event
    // disappeared. Keep the sheet retryable instead of caching a false 404.
    if (!isOperationalEventResolutionError(error)) {
      console.warn(JSON.stringify({
        level: "warn",
        message: "The event summary could not be resolved.",
        phase: "event-summary",
        outcome: "unexpected",
      }));
    }
    return NextResponse.json(
      { error: "temporarily_unavailable" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "5",
        },
      },
    );
  }
}
