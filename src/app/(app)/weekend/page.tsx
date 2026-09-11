import { redirect } from "next/navigation";

/**
 * /weekend is retired (overlap cleanup, 2026-06). The curated weekend
 * view had no in-app entry point — its only linker, TwoDoors, was removed
 * — so it was reachable only by typing the URL, and /events already
 * covers the weekend. Preserve that intent in the redirect so an old
 * bookmark lands on the weekend lens instead of the general event board.
 */
export default function WeekendRedirect(): never {
  redirect("/events?lens=weekend");
}
