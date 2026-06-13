import { redirect } from "next/navigation";

/**
 * /find is retired — the funnel front door (/guide) is the single
 * answer-first "find a place" surface (owner decision, 2026-06). This
 * page was fully built but unreachable in-app (its only linker, TwoDoors,
 * was mounted nowhere), so it duplicated /guide's job.
 *
 * We redirect rather than 404 so any bookmark / external link lands on the
 * real front door. The find-picks library it used lives on — /today still
 * reads it for "open near you."
 */
export default function FindRedirect(): never {
  redirect("/");
}
