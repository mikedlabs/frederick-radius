import { redirect } from "next/navigation";

/**
 * /find is retired — /today is the single answer-first "find a place"
 * surface (its craving strip + the global search cover the find-what-you-want
 * intent). This page was fully built but unreachable in-app (its only linker,
 * TwoDoors, was mounted nowhere), so it duplicated that job. (/guide, the old
 * funnel, has likewise been retired and 308s to /today.)
 *
 * We redirect rather than 404 so any bookmark / external link lands on the
 * real front door. The find-picks library it used lives on — /today still
 * reads it for "open near you."
 */
export default function FindRedirect(): never {
  redirect("/today");
}
