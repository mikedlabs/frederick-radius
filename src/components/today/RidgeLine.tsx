/**
 * RidgeLine — a stylized Frederick-County horizon silhouette that
 * sits at the bottom of the SkyHero, where the sky gradient meets
 * the rest of the page.
 *
 * The shape isn't a literal map of one viewpoint (Catoctin is roughly
 * west; Sugarloaf is southeast — they don't share a panorama from
 * downtown). It's a stylized composite: a long gentle ridgeline with
 * the broad Catoctin profile on the left and the sharper Sugarloaf
 * pyramid on the right. A reader who knows the county will recognize
 * what's being suggested; a reader who doesn't will read it as
 * "mountains" — which is the right answer either way.
 *
 * Implementation notes:
 *
 *   - One inline SVG `<path>`. Roughly 600 bytes gzipped; nothing
 *     loads from disk.
 *   - `preserveAspectRatio="none"` so the silhouette stretches across
 *     any SkyHero width without scaling the height proportionally.
 *   - Fill = `var(--app-bg)`. The page bg pokes up into the sky and
 *     becomes the ridge — so the SkyHero appears to physically
 *     connect to the rest of the page rather than fading out.
 *   - Rendered absolute-positioned at the bottom of SkyHero. Inline
 *     style overrides the `.sky-hero > *` rule that would otherwise
 *     make it position:relative + z-index:2.
 *   - Decorative only. `aria-hidden`, no pointer events. Reduced-
 *     motion users are unaffected (no animation here).
 */
export default function RidgeLine() {
  return (
    <svg
      preserveAspectRatio="none"
      viewBox="0 0 1200 80"
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "44px",
        zIndex: 1,
        pointerEvents: "none",
      }}
    >
      <path
        d="M0,80 L0,58 C80,56 160,52 240,50 C320,48 400,44 460,40 C500,37 520,34 540,33 C560,33 580,35 600,38 C640,44 680,48 720,48 C750,48 770,42 790,32 C805,22 820,12 840,8 C855,5 870,5 885,8 C900,12 915,20 935,32 C960,46 985,52 1020,55 C1080,58 1140,60 1200,62 L1200,80 Z"
        fill="var(--app-bg)"
        fillOpacity="0.96"
      />
      {/* A second, slightly darker ridge sitting BEHIND the foreground
          one. Adds depth — the reader's eye reads it as a distant
          ridge behind the near ridge. Subtle, low opacity. */}
      <path
        d="M0,80 L0,66 C100,64 200,60 280,58 C360,56 440,54 520,55 C580,55 640,57 700,58 C750,59 800,58 840,52 C880,46 910,40 950,42 C1000,45 1060,55 1120,62 C1160,65 1200,67 1200,67 L1200,80 Z"
        fill="var(--app-bg)"
        fillOpacity="0.55"
      />
    </svg>
  );
}
