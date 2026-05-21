/**
 * Era assignment for history entries. Frederick County's 278+ year
 * span breaks naturally into the same chapters most Maryland history
 * survey courses use — we adopt them so the timeline visualization
 * and the article-list grouping speak the same language.
 *
 * Each era is anchored to actual local milestones (1748 founding,
 * 1815 end of the second war with Britain, 1865 Appomattox, 1920
 * end of the WWI/Spanish-flu transition, 1991 Cold War end), so the
 * splits aren't arbitrary calendar rounds.
 */

export type EraKey = "founding" | "civil-war" | "industrial" | "modern" | "contemporary";

export type EraMeta = {
  key: EraKey;
  /** Full label used in the legend, era-stripe meta, and prose. */
  label: string;
  /** Short label used inside narrow timeline-band labels — kept to a
   *  word or two so it fits in a 14%-wide band on mobile. */
  shortLabel: string;
  range: { from: number; to: number };
  color: string;
  blurb: string;
};

export const ERAS: EraMeta[] = [
  {
    key: "founding",
    label: "Founding",
    shortLabel: "Founding",
    range: { from: 1748, to: 1815 },
    color: "#A87B2A",
    blurb: "Colonial frontier and the early Republic. The county is born, Hessian POWs walk the city, the foundry casts cannon for Washington's army.",
  },
  {
    key: "civil-war",
    label: "Civil War era",
    shortLabel: "Civil War",
    range: { from: 1815, to: 1870 },
    color: "#8B2A1F",
    blurb: "Antebellum tension, the 1862 Maryland Campaign and Antietam, and the 1864 Battle of Monocacy that saved Washington.",
  },
  {
    key: "industrial",
    label: "Industrial era",
    shortLabel: "Industry",
    range: { from: 1870, to: 1920 },
    color: "#B58A6E",
    blurb: "Reconstruction, the rail boom, the Clustered Spires becoming postcard-famous, and Frederick growing into a manufacturing town.",
  },
  {
    key: "modern",
    label: "Modern era",
    shortLabel: "Modern",
    range: { from: 1920, to: 1980 },
    color: "#4B5F88",
    blurb: "Camp David, the interstate, Fort Detrick, suburban growth, and Frederick stepping onto the national stage.",
  },
  {
    key: "contemporary",
    label: "Contemporary",
    shortLabel: "Now",
    range: { from: 1980, to: new Date().getUTCFullYear() + 1 },
    color: "#3F6B4E",
    blurb: "Preservation, downtown revival, the wineries and breweries, and the daily life of the modern county.",
  },
];

const ERA_BY_KEY: Record<EraKey, EraMeta> = ERAS.reduce(
  (acc, e) => ({ ...acc, [e.key]: e }),
  {} as Record<EraKey, EraMeta>,
);

/** Resolve a year to its era. Years before 1748 (none in our data
 *  but defensive) land in "founding"; years past the current era
 *  also fall back to "contemporary". */
export function eraForYear(year: number): EraMeta {
  for (const e of ERAS) {
    if (year >= e.range.from && year < e.range.to) return e;
  }
  return year < 1748 ? ERA_BY_KEY.founding : ERA_BY_KEY.contemporary;
}

/** The overall span the timeline visualization covers. */
export const TIMELINE_FROM = ERAS[0].range.from;
export const TIMELINE_TO = ERAS[ERAS.length - 1].range.to;
