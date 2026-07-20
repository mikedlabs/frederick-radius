/**
 * The one way this app writes a clock time in prose.
 *
 * Eastern, the way a person reads it: "6pm", "8am", "6:35pm". The minutes
 * vanish at the top of the hour and the meridiem is lowercase, the house
 * style for body copy (mono/data surfaces keep tabular time; this is prose).
 *
 * Lifted out of two identical inline copies (the /beta briefing line and
 * GuideContents' event times) so the server-seeded clock token and the
 * first client tick format byte-for-byte the same and never jump on
 * hydration.
 */
export function formatEasternClock(date: Date): string {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  // Hours are 1-12 with no leading zero, so ":00" can only be the minutes.
  return label.replace(":00", "").replace(/\s?(AM|PM)/, (_, m: string) => m.toLowerCase());
}
