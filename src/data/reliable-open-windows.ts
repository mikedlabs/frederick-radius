/**
 * Hand-curated reliable weekly hours for well-known places (P0-6).
 *
 * Hours coverage from Google is low, so the home "Open now" panel was
 * almost always empty and showed a defeating empty state. These are
 * marquee Frederick places whose stated hours are dependable enough to
 * surface as "Likely open" when no Google-verified result exists. Keep
 * the list curated and conservative: only places a local would vouch
 * for being open during these windows. Times are 24-hour America/New_York.
 */

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type OpenWindow = Partial<Record<Weekday, [string, string]>>;

const wk = (open: string, close: string): OpenWindow => ({
  mon: [open, close],
  tue: [open, close],
  wed: [open, close],
  thu: [open, close],
  fri: [open, close],
  sat: [open, close],
  sun: [open, close],
});

export const RELIABLE_OPEN_WINDOWS: Record<string, OpenWindow> = {
  "dublin-roasters-frederick": wk("07:00", "18:00"),
  "frederick-coffee-company-frederick": wk("07:00", "20:00"),
  "common-market-frederick": wk("08:00", "21:00"),
  "south-mountain-creamery-middletown": wk("08:00", "20:00"),
  "north-market-pop-shop-frederick": wk("11:00", "21:00"),
  "isabellas-taverna-tapas-bar-frederick": wk("11:30", "22:00"),
  "brewers-alley-frederick": wk("11:00", "23:00"),
  "magoos-frederick": wk("11:00", "23:00"),
  "monocacy-brewing-frederick": wk("12:00", "22:00"),
  "olde-mother-brewing-frederick": wk("15:00", "22:00"),
  "rockwell-brewery-frederick": wk("15:00", "22:00"),
  "smoketown-brewing-brunswick": wk("16:00", "22:00"),
  "bushwaller-irish-pub-frederick": wk("11:00", "23:59"),
  "hootch-and-banter-frederick": wk("16:00", "23:59"),
  "the-cozy-creamery-thurmont": wk("11:00", "21:00"),
  "delaplaine-arts-center-frederick": wk("10:00", "17:00"),
};

/**
 * Is the place open now per its curated window, evaluated in
 * America/New_York. Returns false when there is no window for the slug.
 */
export function isLikelyOpenNow(slug: string, now: Date): boolean {
  const win = RELIABLE_OPEN_WINDOWS[slug];
  if (!win) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const day = map.weekday.toLowerCase().slice(0, 3) as Weekday;
  const span = win[day];
  if (!span) return false;
  const hh = map.hour === "24" ? "00" : map.hour;
  const cur = `${hh.padStart(2, "0")}:${map.minute}`;
  return cur >= span[0] && cur <= span[1];
}
