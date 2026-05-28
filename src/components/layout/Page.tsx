import { type ReactNode } from "react";

/**
 * Page — the three responsive layout primitives every route should
 * pick from. Each one widens deliberately as the viewport grows
 * instead of pinning to one max-width forever.
 *
 *   <PageColumn>  reading column (default for most routes)
 *                  mobile : full width with shell padding
 *                  md+    : max-w-screen-md  (768)
 *                  lg+    : max-w-screen-md  (768, intentionally
 *                           narrower than the shell — long-form
 *                           reading caps even on a big monitor)
 *
 *   <PageWide>   dashboards, dense lists, calendars
 *                  mobile : full width
 *                  md+    : max-w-screen-md  (768)
 *                  lg+    : max-w-screen-lg  (1024)
 *                  xl+    : max-w-screen-xl  (1280)
 *
 *   <PageFull>   full-bleed map, photo book, hero edit experiences
 *                  always full width (no max-width cap)
 *
 * Each renders a <section> with consistent vertical spacing
 * (`space-y-6`, the canonical section gap baked in here). Use the
 * `as` prop to switch to <main> or <div> when needed.
 *
 * Spacing policy (May 2026 audit):
 *   - space-y-2 = within a card / section internals
 *   - space-y-3 = between rows in a list
 *   - space-y-6 = between page sections (the spine, baked in here)
 *   - Avoid space-y-4 and space-y-5 — ambiguous middlings.
 */

type PageProps = {
  children: ReactNode;
  className?: string;
  /** Override the spine gap. Defaults to `space-y-6`; pass a tighter
   *  class (e.g. `space-y-3`) only when the page IS a tight stack. */
  spacing?: string;
  /** Element tag. Default `section`; set `"main"` when this is the
   *  page-root wrapper outside the (app) shell. */
  as?: "section" | "main" | "div";
};

/** Branch on the `as` prop with literal JSX per tag — React Compiler
 *  flags assigning a component reference to a variable and rendering
 *  it dynamically, so we spell out the three cases. The slight
 *  repetition is the price for keeping the compiler quiet. */
function render(as: PageProps["as"], className: string, children: ReactNode) {
  if (as === "main") return <main className={className}>{children}</main>;
  if (as === "div") return <div className={className}>{children}</div>;
  return <section className={className}>{children}</section>;
}

export function PageColumn({
  children,
  className = "",
  spacing = "space-y-6",
  as,
}: PageProps) {
  // Reading column. Stays at 768 even on desktop because long-form
  // text doesn't get easier to read by stretching wider.
  return render(
    as,
    `mx-auto w-full max-w-screen-md ${spacing} ${className}`.trim(),
    children,
  );
}

export function PageWide({
  children,
  className = "",
  spacing = "space-y-6",
  as,
}: PageProps) {
  // Step up at each breakpoint so dashboards and dense lists get
  // real desktop breathing room: 768 → 1024 → 1280.
  return render(
    as,
    `mx-auto w-full max-w-screen-md lg:max-w-screen-lg xl:max-w-screen-xl ${spacing} ${className}`.trim(),
    children,
  );
}

export function PageFull({
  children,
  className = "",
  spacing = "space-y-6",
  as,
}: PageProps) {
  // No max-width. The shell's max-w-screen-md still caps unless the
  // route renders this outside or with `-mx-4` / negative-margin
  // escape. Use sparingly — map, photo book, generative experiences.
  return render(
    as,
    `w-full ${spacing} ${className}`.trim(),
    children,
  );
}
