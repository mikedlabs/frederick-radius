/**
 * Time-of-day material behind the Today weather glance.
 *
 * This component is intentionally synchronous. It is atmosphere, not a
 * weather claim; the verified forecast, alerts, and air-quality state live in
 * TodayCard. Waiting on NWS here used to hold the entire hero behind an extra
 * provider deadline before those useful facts could even begin rendering.
 */

// Two silhouette attempts have now been pulled from the SkyHero
// bottom edge:
//   1. RidgeLine (mountain horizon) — read as "wavy" instead of
//      mountains. Kept at ./RidgeLine.tsx for reference.
//   2. ClusteredSpires (downtown steeples) — the proportions read
//      phallic in the rendered version, not as architecture. Kept
//      at ./ClusteredSpires.tsx; if we revisit, a redesign needs
//      wider tower bases, stepped belfry → spire silhouettes, and
//      unambiguous cross finials (with horizontal arms) to break
//      the "tall narrow shape" read.
// The Frederick identity now lives in the COPY beats — the Monocacy
// / Catoctin sun anchors in AlmanacFooter, the Carroll Creek / Market
// Street / Catoctin trails proper nouns in BriefingLine. The sky
// ends in its own bottom color and the first card below overlaps
// cleanly into it (-mt-4 on the page wrapper).

export type SkyTone = "light" | "dark";
type Sky = { top: string; mid: string; bottom: string; tone: SkyTone };

/**
 * Server-safe helper for the current Eastern-time hour's sky tone.
 * Exposed so other components rendered alongside SkyHero (e.g.
 * WeeklyForecast tucked into the hero region) can color-match
 * without re-deriving the hour. Mirrors paletteForHour's tone tier.
 */
export function currentSkyTone(now: Date = new Date()): SkyTone {
  return currentSkyPalette(now).tone;
}

/**
 * Server-safe helper for the full current Eastern-time sky palette
 * (top / mid / bottom + tone). Exposed so adjacent surfaces — the
 * weather sub-card stack below SkyHero, alerts strips, etc. — can
 * pick up a faint echo of the same sky without re-deriving the
 * hour or the palette table.
 *
 * Note: this is the BASE time-of-day palette, NOT the weather-
 * mood-adjusted one. Adjacent surfaces want the time signal, not
 * the precipitation overlay (rain mood on a card stack would read
 * as a weird gray wash; sky doesn't have that problem because the
 * gradient is the whole canvas).
 */
export function currentSkyPalette(now: Date = new Date()): Sky {
  const h = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(now),
    10,
  );
  return paletteForHour(h);
}

function paletteForHour(h: number): Sky {
  // Sky-bottom colors used to fade to a near-paper-cream (#F0E8D8,
  // #E8E4D5, #E5C99A) so the gradient would "blend into" the page
  // below. The visible result was a milky band right above the
  // RidgeLine that read as snow on bright days — sky desaturating
  // before the ridge even arrives. Fix: keep the BOTTOM stop in the
  // sky family so the sky reads as sky all the way down to the
  // ridge. The RidgeLine (paper-cream silhouette) carries the
  // transition to the page bg; the sky no longer has to fake it.
  //
  // Pre-dawn (3–5)
  if (h >= 3 && h < 6) return { top: "#1B1E3A", mid: "#2E3258", bottom: "#5C4F6E", tone: "dark" };
  // Sunrise (6–7)
  if (h >= 6 && h < 8) return { top: "#F5C28C", mid: "#F08770", bottom: "#B85C8B", tone: "light" };
  // Morning (8–10) — was cream bottom; now a haze blue so the sky
  // doesn't dissolve into paper at the horizon.
  if (h >= 8 && h < 11) return { top: "#A8D8F0", mid: "#C7E5F2", bottom: "#B8D4E4", tone: "light" };
  // Midday (11–14) — was off-white; now a clear-sky horizon.
  if (h >= 11 && h < 15) return { top: "#7CB9E8", mid: "#A8D0EE", bottom: "#9CC5DD", tone: "light" };
  // Afternoon (15–17) — was a pale gold cream; now a warmer afternoon
  // haze that still reads as sky.
  if (h >= 15 && h < 18) return { top: "#7CA8D8", mid: "#B6C8DC", bottom: "#C9B687", tone: "light" };
  // Golden hour (18–19)
  if (h >= 18 && h < 20) return { top: "#D88860", mid: "#E8A878", bottom: "#F5C898", tone: "light" };
  // Twilight (20–21)
  // Twilight's bottom rose is deepened from #C97B7B. That stop failed AA under
  // BOTH dark-tone foregrounds even at full opacity (3.07:1 on #FCFBF8, 2.75:1
  // on cream) — the only stop in the whole palette that did, and the copy sits
  // lowest in the gradient where it is worst. #8F575F reads 5.49:1 and 4.92:1.
  // Every other dark stop already clears comfortably (5.85:1 and up).
  if (h >= 20 && h < 22) return { top: "#3D3460", mid: "#7A5680", bottom: "#8F575F", tone: "dark" };
  // Night (22–2)
  return { top: "#0F1428", mid: "#1F2444", bottom: "#3A3458", tone: "dark" };
}

export default function SkyHero({
  children,
  className = "",
  fill = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Cinematic fold on mobile: grow the sky so it owns most of the first
   *  screen, centering the weather glance in the gradient with a quiet
   *  scroll cue at the bottom edge. `true` = tall (~72svh, the full
   *  Apple-Weather fold); `"medium"` = ~55svh so the NEXT section still
   *  peeks above the fold (drama without burying the answer). Resets to a
   *  normal-height block at lg+ so the desktop two-column layout is
   *  untouched. */
  fill?: boolean | "medium";
}) {
  const nyHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10
  );
  const sky = paletteForHour(nyHour);

  return (
    <section
      className={`sky-hero overflow-hidden rounded-[var(--app-radius-lg)] px-4 py-4 ${
        fill === "medium"
          ? "flex min-h-[55svh] flex-col lg:!min-h-0 lg:block"
          : fill
            ? "flex min-h-[72svh] flex-col lg:!min-h-0 lg:block"
            : ""
      } ${className}`}
      style={
        {
          "--sky-top": sky.top,
          "--sky-mid": sky.mid,
          "--sky-bottom": sky.bottom,
          color: sky.tone === "dark" ? "#FCFBF8" : "#11100C",
        } as React.CSSProperties
      }
      data-sky-tone={sky.tone}
      data-sky-mood="time"
    >
      {/* Fine film grain sits above the gradient but below content, giving
          the sky material texture instead of a flat CSS wash. */}
      <div aria-hidden className="sky-grain" />
      {/* Fill mode centers the weather glance in the tall sky (the
          Apple-Weather "city up top, temp in the field" composition);
          on lg the wrapper is inert so the desktop card layout holds. */}
      {fill ? (
        <div className="flex flex-1 flex-col justify-center lg:block">
          {children}
        </div>
      ) : (
        children
      )}

      {/* Scroll cue — a quiet, tone-aware chevron at the bottom of the
          fold that says "there's more below" without a label. Mobile
          only; the desktop layout shows the next sections inline. */}
      {fill && (
        <div
          aria-hidden
          className="mt-4 flex shrink-0 justify-center pb-1 opacity-60 lg:hidden"
        >
          <svg
            className="h-5 w-5 animate-bounce motion-reduce:animate-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      )}
      {/* No silhouette mounted here right now. See the import-area
          comment for the history of attempts (mountains, spires).
          Frederick identity lives in the AlmanacFooter + BriefingLine
          copy until the silhouette gets a designed-from-scratch pass. */}
    </section>
  );
}
