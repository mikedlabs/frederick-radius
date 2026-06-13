import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { buildMoveStack } from "@/lib/moveStack";
import PlanDeck from "./PlanDeck";

/**
 * MoveStack — the "plan for your next few hours" itinerary on /today.
 * One confident sequence (dinner → drinks → music) instead of a wall of
 * options, ranked by editorial score + proximity, weather- and
 * time-of-day-aware. Hides itself if fewer than two stops resolve.
 *
 * Server component: it owns the NWS fetch + buildMoveStack (the heavy,
 * client-unsafe data path) and hands the resolved steps to PlanDeck,
 * the client leaf that renders the P4 horizontal snap deck. The NWS
 * fetch is cached/shared with the rest of the page.
 */
export default async function MoveStack() {
  const now = new Date();
  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const cond = (forecast?.hourly?.[0]?.shortForecast ?? "").toLowerCase();
  const wet = /rain|shower|drizzle|thunder|storm|snow|sleet|wintry/.test(cond);
  const stack = buildMoveStack(now, { wet });
  if (!stack) return null;

  return <PlanDeck title={stack.title} intro={stack.intro} steps={stack.steps} />;
}
