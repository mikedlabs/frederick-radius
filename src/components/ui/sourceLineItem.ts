/**
 * One item in a muted provenance line (the place and event source lines).
 * Each item owns the middle dot before it, and draws it only when a
 * non-empty item comes earlier in the line. An empty item, such as a
 * FreshnessChip before hydration or with an unparseable date, hides itself
 * and never counts as the item before the next one, so the line never starts
 * with a stray dot. A selector cannot see where flex-wrap breaks a row, so an
 * item that wraps still carries its dot to the start of the new row.
 *
 * The dot is decoration. `content: "·" / ""` gives it empty alternative text,
 * so screen readers do not announce "middle dot" between items, matching
 * the event line's aria-hidden separator. A browser without that syntax
 * drops the second declaration and keeps the plain dot.
 */
export const SOURCE_LINE_ITEM =
  "inline-flex min-w-0 items-center gap-2 empty:hidden [*:not(:empty)~&]:before:content-['·'] [*:not(:empty)~&]:before:[content:'·'_/_'']";
