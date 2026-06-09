import { redirect } from "next/navigation";

/**
 * /weekend is retired (overlap cleanup, 2026-06). The curated weekend
 * view had no in-app entry point — its only linker, TwoDoors, was removed
 * — so it was reachable only by typing the URL, and /events already
 * covers the weekend (it leads with a weekend tier and filters by it).
 * Redirect to /events (rather than 404) so any bookmark or old link lands
 * on the live events surface.
 */
export default function WeekendRedirect(): never {
  redirect("/events");
}
