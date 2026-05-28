import { type ReactNode } from "react";

/**
 * Page — the three layout primitives every route should pick from.
 *
 * Pre-audit, every page hard-coded `max-w-screen-md` (768px) via the
 * app layout shell. That works for phone-first reading but wastes
 * desktop real estate on surfaces that genuinely want more (the map,
 * a calendar, the live dashboard). These three variants encode the
 * three legitimate widths:
 *
 *   - <PageColumn>  max-w-screen-md  (768) — reading column, default
 *   - <PageWide>    max-w-screen-lg  (1024) — dashboards, dense lists
 *   - <PageFull>    no max width — full-bleed map, photo book, etc.
 *
 * Each renders a <section> with consistent vertical spacing
 * (`space-y-6`, our canonical section gap), and no extra chrome.
 * Routes can drop a Page primitive INSIDE the existing app shell or
 * at the route root — both work because the shell already centers
 * with `mx-auto px-4` and these primitives just override the max.
 *
 * Use the `as` prop if you need to render something other than a
 * <section> (e.g. <main> when this is the page-root element).
 *
 * Spacing policy (May 2026 audit):
 *   - space-y-2 = within a card / section internals
 *   - space-y-3 = between rows in a list
 *   - space-y-6 = between page sections (the spine, baked in here)
 *   - Avoid space-y-4 and space-y-5 — they're ambiguous middlings.
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
  return render(
    as,
    `mx-auto w-full max-w-screen-lg ${spacing} ${className}`.trim(),
    children,
  );
}

export function PageFull({
  children,
  className = "",
  spacing = "space-y-6",
  as,
}: PageProps) {
  return render(
    as,
    `w-full ${spacing} ${className}`.trim(),
    children,
  );
}
