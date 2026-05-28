/**
 * ClusteredSpires — a stylized silhouette of Frederick's downtown
 * skyline, sitting at the bottom of the SkyHero where the sky gradient
 * meets the rest of the page.
 *
 * Why this exists
 *   Frederick is literally nicknamed "The City of the Clustered Spires"
 *   (Whittier wrote the line in 1863: "The clustered spires of Frederick
 *   stand / Green-walled by the hills of Maryland"). The downtown
 *   skyline is THE Frederick visual identifier — the church steeples
 *   along West Church Street + the historic district read as the city
 *   in a way no other landmark does.
 *
 *   The previous RidgeLine (a soft mountain horizon) was removed pre-
 *   launch because users kept reading the curves as "wavy" rather than
 *   as mountains. Spires don't have that problem: they're sharp
 *   vertical lines that unambiguously read as architecture. A reader
 *   who knows Frederick will recognize the clustered profile; a reader
 *   who doesn't will read "town skyline" — which is the right answer
 *   either way.
 *
 * Implementation
 *   One inline SVG path. Roughly 700 bytes gzipped; nothing loads from
 *   disk. `preserveAspectRatio="none"` so the silhouette stretches
 *   horizontally with the SkyHero. Fill is `var(--app-bg)` so the page
 *   bg pokes up into the sky and BECOMES the silhouette — the SkyHero
 *   appears to physically meet the rest of the page rather than fading
 *   out at the bottom.
 *
 *   Decorative only. `aria-hidden`, no pointer events. Reduced-motion
 *   users are unaffected (no animation here).
 *
 *   The shape is a stylized composite of the historic Trinity Chapel,
 *   Evangelical Reformed, All Saints, and the rest of the downtown
 *   cluster — not a literal one-to-one rendering. The five tallest
 *   spires anchor the silhouette; the connecting rooftops give it the
 *   "row of buildings" read that single landmarks don't have.
 */
export default function ClusteredSpires() {
  return (
    <svg
      preserveAspectRatio="none"
      viewBox="0 0 1200 120"
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "84px",
        zIndex: 1,
        pointerEvents: "none",
      }}
    >
      {/* Faint distant skyline — sits behind the foreground spires for
          a hint of depth. Same shape family, lower amplitude, lower
          opacity. Reads as "downtown extends further than the main
          cluster." */}
      <path
        d="
          M 0,120
          L 0,102
          L 180,102
          L 195,102 L 195,82 L 207,72 L 209,68 L 211,72 L 223,82 L 223,102
          L 410,102
          L 425,102 L 425,76 L 438,62 L 440,58 L 442,62 L 455,76 L 455,102
          L 640,102
          L 655,102 L 655,80 L 668,68 L 670,64 L 672,68 L 685,80 L 685,102
          L 880,102
          L 895,102 L 895,84 L 906,74 L 908,70 L 910,74 L 921,84 L 921,102
          L 1200,102
          L 1200,120
          Z
        "
        fill="var(--app-bg)"
        fillOpacity="0.55"
      />
      {/* Foreground clustered spires — the main silhouette. Five
          steeples of varying heights, with rooftops between them so
          the shape reads as a row of historic downtown buildings,
          not a row of needles. The tallest spire sits roughly centered
          (where the historic Trinity Chapel anchors the actual
          downtown skyline). */}
      <path
        d="
          M 0,120
          L 0,110
          L 150,110

          L 175,110
          L 175,52
          L 192,30
          L 192,22
          L 196,12
          L 200,22
          L 200,30
          L 217,52
          L 217,110

          L 320,110

          L 350,110
          L 350,40
          L 366,20
          L 366,10
          L 370,4
          L 374,10
          L 374,20
          L 390,40
          L 390,110

          L 500,110

          L 525,110
          L 525,55
          L 542,32
          L 542,22
          L 546,14
          L 550,22
          L 550,32
          L 567,55
          L 567,110

          L 700,110

          L 728,110
          L 728,45
          L 746,25
          L 746,15
          L 750,8
          L 754,15
          L 754,25
          L 772,45
          L 772,110

          L 900,110

          L 925,110
          L 925,68
          L 942,48
          L 942,38
          L 946,30
          L 950,38
          L 950,48
          L 967,68
          L 967,110

          L 1200,110
          L 1200,120
          Z
        "
        fill="var(--app-bg)"
        fillOpacity="0.97"
      />
    </svg>
  );
}
