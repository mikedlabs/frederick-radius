/**
 * Public outdoor pools — seasonal "open now" status for the Today card.
 *
 * The City of Frederick runs two outdoor pools with published seasonal hours
 * (Diggs in Mullinix Park, Thomas in Baker Park). Hours are verified from the
 * City Parks & Rec hours sheet (playfrederick.com) and split into pre-season /
 * full-season / post-season windows.
 *
 * ⚠ UPDATE EACH SPRING: the season DATES and Labor-Day end shift yearly. The
 * 2026 sheet: pre-season May 23 – Jun 21, full season Jun 22 – Aug 18, post
 * season Aug 19 – Labor Day. Out of season the Today card renders nothing.
 *
 * Pure + deterministic (now is passed in), so the status is correct on a UTC
 * server and unit-testable. Eastern wall-clock is derived here independently
 * (with minutes, which the shared easternParts omits).
 */

export type Pool = {
  slug: string;
  name: string;
  /** Short label for the compact card. */
  short: string;
  city: string;
  lng: number;
  lat: number;
  phone?: string;
};

export const POOLS: Pool[] = [
  {
    slug: "william-r-diggs-memorial-swimming-pool",
    name: "William R. Diggs Memorial Pool",
    short: "Diggs Pool",
    city: "Frederick",
    lng: -77.4133749,
    lat: 39.4121311,
    phone: "(301) 600-6364",
  },
  {
    slug: "edward-p-thomas-memorial-pool-playground",
    name: "Edward P. Thomas Memorial Pool",
    short: "Thomas Pool",
    city: "Frederick",
    lng: -77.4198141,
    lat: 39.4157277,
  },
];

/**
 * Other public outdoor pools around the county. We deliberately do NOT compute
 * a live open/now for these: their hours are each town's, and we haven't
 * verified them to the minute the way the City of Frederick sheet lets us for
 * Diggs/Thomas. So the Today card lists them (linked to their place page for
 * details) as "open for the season" instead of a real-time claim we can't stand
 * behind. Both are confirmed operating outdoor pools with pages in the dataset.
 */
export type CountyPool = { slug: string; name: string; town: string };

export const MORE_POOLS: CountyPool[] = [
  { slug: "brunswick-municipal-swimming-pool-brunswick", name: "Brunswick Municipal Pool", town: "Brunswick" },
  { slug: "emmitsburg-community-pool-emmitsburg", name: "Emmitsburg Community Pool", town: "Emmitsburg" },
];

type Phase = "pre" | "full" | "post" | "off";
/** Minutes from midnight, or null = closed that day. */
type DayWindow = { open: number; close: number } | null;

const HM = (h: number, m = 0) => h * 60 + m;

/** Eastern wall-clock parts incl. minutes (the shared easternParts omits them). */
function easternNow(now: Date): { md: number; weekday: number; minutes: number; year: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    md: Number(p.month) * 100 + Number(p.day),
    weekday: WD[p.weekday] ?? 0,
    minutes: (Number(p.hour) % 24) * 60 + Number(p.minute),
    year: Number(p.year),
  };
}

/** Labor Day (first Monday of September) as a month*100+day ordinal. */
function laborDayMd(year: number): number {
  const dow = new Date(Date.UTC(year, 8, 1)).getUTCDay(); // 0=Sun
  const day = 1 + ((1 - dow + 7) % 7);
  return 900 + day;
}

function phaseFor(md: number, year: number): Phase {
  if (md >= 523 && md <= 621) return "pre";
  if (md >= 622 && md <= 818) return "full";
  if (md >= 819 && md <= laborDayMd(year)) return "post";
  return "off";
}

/** Today's open window for a pool, by phase + weekday (0=Sun..6=Sat). */
function windowFor(slug: string, phase: Phase, weekday: number, md: number, year: number): DayWindow {
  const isLaborDay = md === laborDayMd(year);
  if (phase === "pre") {
    // Both pools: Mon–Fri 4–7 PM; weekends 12:30–7 PM.
    return weekday === 0 || weekday === 6 ? { open: HM(12, 30), close: HM(19) } : { open: HM(16), close: HM(19) };
  }
  if (phase === "full") {
    if (slug === "william-r-diggs-memorial-swimming-pool") {
      return weekday === 0 ? { open: HM(12, 30), close: HM(20) } : { open: HM(11), close: HM(20) };
    }
    // Thomas: every day 12:30–8 PM.
    return { open: HM(12, 30), close: HM(20) };
  }
  if (phase === "post") {
    if (slug === "william-r-diggs-memorial-swimming-pool") {
      if (isLaborDay) return { open: HM(12, 30), close: HM(19) };
      if (weekday === 6) return { open: HM(11), close: HM(19) };
      if (weekday === 0) return { open: HM(12, 30), close: HM(19) };
      return null; // weekdays closed
    }
    // Thomas: weekends + Labor Day 12:30–7 PM.
    if (isLaborDay || weekday === 0 || weekday === 6) return { open: HM(12, 30), close: HM(19) };
    return null;
  }
  return null;
}

function label(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export type PoolStatus = Pool & {
  openNow: boolean;
  /** A short, honest status line: open-until / opens-at / closed-today. */
  line: string;
};

/**
 * Per-pool open/closed status for `now`, plus whether pools are in season at
 * all. Out of season → inSeason:false (the card hides). In season, every pool
 * carries an honest line: "Open now until 8 PM", "Opens 12:30 PM", or "Closed
 * today".
 */
export function poolsStatus(now: Date): { inSeason: boolean; anyOpen: boolean; pools: PoolStatus[] } {
  const { md, weekday, minutes, year } = easternNow(now);
  const phase = phaseFor(md, year);
  if (phase === "off") return { inSeason: false, anyOpen: false, pools: [] };

  let anyOpen = false;
  const pools = POOLS.map((p) => {
    const w = windowFor(p.slug, phase, weekday, md, year);
    let openNow = false;
    let line: string;
    if (!w) {
      line = "Closed today";
    } else if (minutes < w.open) {
      line = `Opens ${label(w.open)}`;
    } else if (minutes < w.close) {
      openNow = true;
      line = `Open now until ${label(w.close)}`;
    } else {
      line = "Closed for the day";
    }
    if (openNow) anyOpen = true;
    return { ...p, openNow, line };
  });
  return { inSeason: true, anyOpen, pools };
}
