import { redirect } from "next/navigation";

/**
 * /nearby is retired (overlap cleanup, 2026-06). It was the
 * "craving → nearest open" one-tap tool, but it had no in-app entry point
 * — nothing linked to it, so it was reachable only by typing the URL —
 * and the /guide funnel plus the map's Open-now lens already answer
 * "find me an open X." Redirect to /guide (rather than 404) so any
 * bookmark or old link lands on the live front door.
 */
export default function NearbyRedirect(): never {
  redirect("/guide");
}
