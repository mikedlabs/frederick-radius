/**
 * PROTOTYPE sample data — Frederick-flavored, hardcoded. Used only by the
 * /proto/* design prototypes (throwaway routes). Not wired to real loaders.
 */

export type ProtoKind = "event" | "deal" | "happy";
export type ProtoItem = {
  kind: ProtoKind;
  title: string;
  venue: string;
  town: string;
  when: string;
};
export type ProtoDay = {
  key: string;
  weekday: string;
  date: string;
  label: string;
  /** Filing-ink CSS var for the day's color block. */
  ink: string;
  items: ProtoItem[];
};

export const KIND_LABEL: Record<ProtoKind, string> = {
  event: "Event",
  deal: "Deal",
  happy: "Happy hour",
};

export const WEEK: ProtoDay[] = [
  {
    key: "today",
    weekday: "Wednesday",
    date: "06.17",
    label: "Today",
    ink: "var(--app-brand-2)",
    items: [
      { kind: "event", title: "Alive @ Five", venue: "Carroll Creek", town: "Frederick", when: "5:00 PM" },
      { kind: "happy", title: "$8 Old Fashioneds", venue: "Tenth Ward Distilling", town: "Frederick", when: "4–7 PM" },
      { kind: "deal", title: "1/2 price wine bottles", venue: "Hootch & Banter", town: "Frederick", when: "All night" },
    ],
  },
  {
    key: "tomorrow",
    weekday: "Thursday",
    date: "06.18",
    label: "Tomorrow",
    ink: "var(--app-cool)",
    items: [
      { kind: "event", title: "Sky Stage salsa night", venue: "Sky Stage", town: "Frederick", when: "7:00 PM" },
      { kind: "happy", title: "Oyster Thursday, $1 oysters", venue: "Monkey Lala", town: "Frederick", when: "5–9 PM" },
    ],
  },
  {
    key: "friday",
    weekday: "Friday",
    date: "06.19",
    label: "Friday",
    ink: "var(--app-brand-press)",
    items: [
      { kind: "event", title: "Frederick Keys vs. Trenton", venue: "Nymeo Field", town: "Frederick", when: "7:00 PM" },
      { kind: "event", title: "First Friday gallery walk", venue: "Downtown", town: "Frederick", when: "5–9 PM" },
      { kind: "deal", title: "Crab feast, $35", venue: "Avery's Maryland Grille", town: "Frederick", when: "All day" },
    ],
  },
  {
    key: "weekend",
    weekday: "Sat–Sun",
    date: "06.20",
    label: "Weekend",
    ink: "var(--app-accent)",
    items: [
      { kind: "event", title: "Great Frederick Farmers Market", venue: "Wormans Mill", town: "Frederick", when: "Sat 9 AM" },
      { kind: "event", title: "Catoctin Forest Alliance hike", venue: "Cunningham Falls", town: "Thurmont", when: "Sun 8 AM" },
    ],
  },
];
