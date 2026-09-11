export type HorizontalRailSweepOptions = {
  selector: string;
  settleMs: number;
  stepFraction: number;
  maxStepsPerRail: number;
};

export type HorizontalRailSweepResult = {
  railsFound: number;
  railsSwept: number;
  positionsVisited: number;
};

/**
 * Exercise lazy content inside explicitly marked horizontal rails.
 *
 * This function is passed directly to Playwright's `page.evaluate`, so it is
 * deliberately self-contained: do not close over module-level values. Rails
 * and the page are restored before the audit records any layout or image
 * findings, keeping this an observation-only interaction.
 */
export async function sweepMarkedHorizontalRails(
  options: HorizontalRailSweepOptions,
): Promise<HorizontalRailSweepResult> {
  const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
  const rails = [...document.querySelectorAll<HTMLElement>(options.selector)];
  const originalWindowX = window.scrollX;
  const originalWindowY = window.scrollY;
  let railsSwept = 0;
  let positionsVisited = 0;

  for (const rail of rails) {
    const originalScrollLeft = rail.scrollLeft;
    const clientWidth = Math.max(0, rail.clientWidth);
    const maxScrollLeft = Math.max(0, rail.scrollWidth - clientWidth);
    if (clientWidth <= 0 || maxScrollLeft <= 1) continue;

    rail.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    await sleep(options.settleMs);

    const preferredStep = Math.max(1, Math.round(clientWidth * options.stepFraction));
    const naturalStepCount = Math.max(1, Math.ceil(maxScrollLeft / preferredStep));
    const stepCount = Math.max(1, Math.min(naturalStepCount, options.maxStepsPerRail));

    for (let step = 0; step <= stepCount; step += 1) {
      // Even spacing guarantees that the terminal edge is visited while the
      // explicit step cap prevents a malformed rail from stalling the audit.
      rail.scrollLeft = Math.round((maxScrollLeft * step) / stepCount);
      positionsVisited += 1;
      await sleep(options.settleMs);
    }

    rail.scrollLeft = originalScrollLeft;
    await sleep(options.settleMs);
    railsSwept += 1;
  }

  window.scrollTo({
    left: originalWindowX,
    top: originalWindowY,
    behavior: "instant",
  });
  await sleep(options.settleMs);

  return {
    railsFound: rails.length,
    railsSwept,
    positionsVisited,
  };
}
