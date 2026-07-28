/**
 * Client-safe presentation contract for the beta cover flight. The server
 * assembles each slide from the aerial manifest and place-hours data; the
 * client only rotates the prepared slides and formats the evidence line.
 */
export type FlightSlide = {
  src: string;
  /** "39.4147° N · 77.4256° W" — the drone's own fix. */
  coordLabel: string;
  /** "210 m up · Oct 2024" (altitude omitted when the fix lacks one). */
  flightLabel: string;
  /** Places within a half mile of the fix. */
  total: number;
  /** Nearby places with hours recent enough to support an open/closed claim. */
  reliable: number;
  /** Of those, open right now. */
  open: number;
};

/**
 * Describe Radius's evidence, never the unknowable state of every nearby
 * business. A zero open count is only meaningful alongside the number of
 * listings whose hours are current.
 */
export function flightStatusLine(slide: FlightSlide): string {
  if (slide.total === 0) {
    return "No listed places sit within a half mile of this spot.";
  }
  const nearby = `${slide.total} ${slide.total === 1 ? "place" : "places"} within a half mile`;
  if (slide.reliable === 0) {
    return `${nearby}, but none has current hours. Radius cannot confirm what is open.`;
  }
  const coverage = `${slide.reliable} of ${nearby} ${slide.reliable === 1 ? "has" : "have"} current hours.`;
  const open =
    slide.open === 0
      ? "None is confirmed open now."
      : `${slide.open} ${slide.open === 1 ? "is" : "are"} confirmed open now.`;
  return `${coverage} ${open}`;
}
