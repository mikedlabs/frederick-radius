/**
 * timeLens — the ONE dictionary for time-lens words (UX-03).
 *
 * The map dock (?t=, dockCaption.ts) and the events board (?lens=/?tod=,
 * boardCaption.ts) each grew their own time labels, and the July 2026
 * review caught them drifting ("This week" vs "Anytime" vs "Later this
 * week" for near-identical questions). The params and per-surface key
 * sets stay exactly as audited — this lib owns only the WORDS, so a
 * label can never say two different things for the same window again.
 *
 * Semantics each word is pinned to (don't reuse across windows):
 *   now        — live at this moment (the map's on-now gate)
 *   today      — the rest of today's Eastern calendar day
 *   tonight    — today's evening daypart
 *   tomorrow   — tomorrow's Eastern calendar day (?d= on events)
 *   weekend    — the coming Sat+Sun window
 *   week       — a rolling 7-day horizon (the map's whole event set)
 *   laterWeek  — this week MINUS today/weekend (the events lens)
 *   anytime    — no temporal narrowing at all
 *
 * Pure module — no clock, no DOM. Both caption spec files pin parity
 * against these values.
 */

export const LENS_WORDS = {
  now: "Happening now",
  today: "Today",
  tonight: "Tonight",
  tomorrow: "Tomorrow",
  weekend: "This weekend",
  week: "This week",
  laterWeek: "Later this week",
  anytime: "Anytime",
} as const;

export type LensWord = keyof typeof LENS_WORDS;
