/**
 * Per-navigation remount boundary for the (app) routes.
 *
 * template.tsx (unlike layout.tsx) re-mounts its subtree on every navigation.
 * That remount is LOAD-BEARING — surfaces like EventsExplorer parse the URL at
 * mount time and rely on "template remounts on nav, so mount == navigation",
 * so this file must stay even though it renders nothing of its own.
 *
 * It no longer applies a crossfade. The app ran TWO route-level transitions at
 * once — this wrapper's `.route-fade` opacity ramp AND the View Transitions API
 * (@view-transition in globals.css) — so every navigation faded in twice,
 * producing the brief washed / blank frame (2026-07 shell-hardening P5). We
 * keep the View Transitions system (GPU-composited, reduced-motion gated, and
 * the only one that carries the place-photo shared-element morph) and drop this
 * second fade; the `.route-fade` CSS was removed from globals.css with it.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
