import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { addFairPlanItem, createFairPlan } from "@/lib/fair/plan";
import type { FairPartyOffer } from "@/lib/fair/party-plan";
import { greatFrederickFair2026PracticalAnswers } from "@/data/fair/great-frederick-fair-2026-practical-answers";
import {
  fairTransitTravelSummary,
  greatFrederickFair2026TransitReview,
} from "@/data/fair/great-frederick-fair-2026-transit";

import FairDayWorkspace from "./FairDayWorkspace";
import type {
  FairDayScheduleItemView,
  FairDayWorkspaceData,
} from "./types";

const OFFICIAL_FAIR_URL = "https://thegreatfrederickfair.com/come-to-the-fair/";
const OFFICIAL_VISIT_URL = "https://thegreatfrederickfair.com/plan-your-visit/";
const OFFICIAL_SCHEDULE_URL = "https://thegreatfrederickfair.com/schedule/";
const STORY_REVISION = `sha256:${"a".repeat(64)}`;
const STORY_NOW = "2026-09-01T18:40:08Z";
const STORY_FULL_FAIR_DATES = {
  startsOn: "2026-09-18",
  endsOn: "2026-09-26",
};
const STORY_ADMISSION_URL =
  "https://www.etix.com/ticket/v/11115/the-great-frederick-fair-advanced-gate?partner_id=944";
const STORY_JACK_URL =
  "https://www.etix.com/ticket/p/36957156/jack-pass-frederick-the-great-frederick-fair-advanced-gate?partner_id=944";
const STORY_CARLOAD_URL =
  "https://www.etix.com/ticket/p/66497377/carload-special-tuesday-sept22-lot-d-onlythe-great-frederick-fair-frederick-the-great-frederick-fair-advanced-gate?partner_id=944";

const storyPartyOffers: FairPartyOffer[] = [
  {
    id: "offer-adult-admission-early",
    label: "Opening-Friday adult admission online",
    kind: "adult-online-admission",
    unitPriceCents: 800,
    validDates: { startsOn: "2026-09-18", endsOn: "2026-09-18" },
    deadline: { status: "known", value: "2026-09-18T17:00:00-04:00" },
    pastKnownDeadline: false,
    officialInfoUrl: OFFICIAL_FAIR_URL,
    officialPurchaseUrl: STORY_ADMISSION_URL,
  },
  {
    id: "offer-adult-admission-online",
    label: "Adult admission online",
    kind: "adult-online-admission",
    unitPriceCents: 1_000,
    validDates: STORY_FULL_FAIR_DATES,
    deadline: { status: "unknown" },
    pastKnownDeadline: false,
    officialInfoUrl: OFFICIAL_FAIR_URL,
    officialPurchaseUrl: STORY_ADMISSION_URL,
  },
  {
    id: "offer-child-admission",
    label: "Child admission",
    kind: "child-admission",
    unitPriceCents: 0,
    validDates: STORY_FULL_FAIR_DATES,
    deadline: { status: "unknown" },
    pastKnownDeadline: false,
    officialInfoUrl: OFFICIAL_FAIR_URL,
    officialPurchaseUrl: null,
  },
  {
    id: "offer-blue-ribbon-bundle",
    label: "Blue Ribbon Bundle",
    kind: "blue-ribbon-bundle",
    unitPriceCents: 8_000,
    validDates: STORY_FULL_FAIR_DATES,
    deadline: { status: "unknown" },
    pastKnownDeadline: false,
    officialInfoUrl: OFFICIAL_FAIR_URL,
    officialPurchaseUrl: STORY_ADMISSION_URL,
  },
  {
    id: "offer-jack-pass",
    label: "Jack Pass",
    kind: "jack-pass",
    unitPriceCents: 3_500,
    validDates: STORY_FULL_FAIR_DATES,
    deadline: { status: "known", value: "2026-09-18T17:00:00-04:00" },
    pastKnownDeadline: false,
    officialInfoUrl: OFFICIAL_FAIR_URL,
    officialPurchaseUrl: STORY_JACK_URL,
  },
  {
    id: "offer-carload-special",
    label: "Tuesday Carload Special",
    kind: "carload-special",
    unitPriceCents: 6_000,
    validDates: { startsOn: "2026-09-22", endsOn: "2026-09-22" },
    deadline: { status: "known", value: "2026-09-22T19:00:00-04:00" },
    pastKnownDeadline: false,
    officialInfoUrl: OFFICIAL_FAIR_URL,
    officialPurchaseUrl: STORY_CARLOAD_URL,
  },
];

function storyScheduleItem({
  date,
  suffix,
  position,
  text,
  timeLabel,
  startsAt,
  placeLabel,
  kind,
}: {
  date: string;
  suffix: string;
  position: number;
  text: string;
  timeLabel: string;
  startsAt: string;
  placeLabel: string;
  kind: FairDayScheduleItemView["kind"];
}): FairDayScheduleItemView {
  const id = `schedule-${date}-${suffix}`;
  const sourceItem = {
    id,
    dayId: `day-${date}`,
    fairDate: date,
    sourcePosition: position,
    text,
    timeLabel,
    inheritedTimeLabel: null,
    timeOrigin: "explicit" as const,
    timing: "exact" as const,
    startsAt,
    endsAt: null,
    sourceUid: `story-${date}`,
    recurrenceId: null,
    sourceModifiedAt: STORY_NOW,
    sourceUrl: OFFICIAL_SCHEDULE_URL as "https://thegreatfrederickfair.com/schedule/",
  };
  return {
    id,
    date,
    title: text,
    timeLabel,
    placeLabel,
    kind,
    sourceUrl: OFFICIAL_SCHEDULE_URL,
    sourceItem,
  };
}

const storyScheduleItems: FairDayScheduleItemView[] = [
  storyScheduleItem({
    date: "2026-09-18",
    suffix: "youth-livestock",
    position: 1,
    text: "Youth livestock program - Bldg. 32",
    timeLabel: "5:00 PM",
    startsAt: "2026-09-18T17:00:00-04:00",
    placeLabel: "Published place: Bldg. 32.",
    kind: "agriculture",
  }),
  storyScheduleItem({
    date: "2026-09-18",
    suffix: "opening-program",
    position: 2,
    text: "Opening-day program",
    timeLabel: "6:00 PM",
    startsAt: "2026-09-18T18:00:00-04:00",
    placeLabel: "The official schedule does not publish a separate place field.",
    kind: "other",
  }),
  storyScheduleItem({
    date: "2026-09-18",
    suffix: "evening-concert",
    position: 3,
    text: "Evening concert program",
    timeLabel: "8:00 PM",
    startsAt: "2026-09-18T20:00:00-04:00",
    placeLabel: "The official schedule does not publish a separate place field.",
    kind: "concert",
  }),
  storyScheduleItem({
    date: "2026-09-19",
    suffix: "dairy-show",
    position: 1,
    text: "Dairy show program - Bldg. 32",
    timeLabel: "10:00 AM",
    startsAt: "2026-09-19T10:00:00-04:00",
    placeLabel: "Published place: Bldg. 32.",
    kind: "agriculture",
  }),
];

const storyPlanBase = createFairPlan({
  fairId: "great-frederick-fair-2026",
  packRevision: STORY_REVISION,
  now: STORY_NOW,
  selectedDayId: "day-2026-09-18",
});
const storyPlan = addFairPlanItem(
  addFairPlanItem(storyPlanBase, storyScheduleItems[0].sourceItem, STORY_NOW),
  storyScheduleItems[2].sourceItem,
  STORY_NOW,
);

export const fairDayStoryData: FairDayWorkspaceData = {
  fairId: "great-frederick-fair-2026",
  packRevision: STORY_REVISION,
  eventName: "The Great Frederick Fair",
  dateRangeLabel: "September 18 through 26",
  yearLabel: "2026",
  disclosure:
    "Radius is an independent local guide. Fair details come from official Fair sources linked below.",
  eventPhase: "pre-fair",
  eventPhaseLabel: "Before the Fair",
  reviewedAt: STORY_NOW,
  dates: [
    ["2026-09-18", "Fri", "18", "4 PM"],
    ["2026-09-19", "Sat", "19", "9 AM"],
    ["2026-09-20", "Sun", "20", "9 AM"],
    ["2026-09-21", "Mon", "21", "9 AM"],
    ["2026-09-22", "Tue", "22", "9 AM"],
    ["2026-09-23", "Wed", "23", "9 AM"],
    ["2026-09-24", "Thu", "24", "9 AM"],
    ["2026-09-25", "Fri", "25", "9 AM"],
    ["2026-09-26", "Sat", "26", "9 AM"],
  ].map(([date, weekdayLabel, dayLabel, gateHoursLabel]) => ({
    date,
    weekdayLabel,
    dayLabel,
    gateHoursLabel,
    gateOpensAt: `${date}T${gateHoursLabel === "4 PM" ? "16" : "09"}:00:00-04:00`,
    gateClosesAt: `${date}T22:00:00-04:00`,
  })),
  initialDate: "2026-09-18",
  offers: [
    {
      id: "offer-adult-admission-early",
      label: "Opening-Friday adult admission online",
      priceLabel: "$8",
      detail: "Adults age 11 and older can use this admission on opening Friday before the known purchase deadline.",
      deadlineLabel: "Official sales end September 18 at 5:00 PM.",
      deadlineAt: "2026-09-18T17:00:00-04:00",
      officialInfoUrl: OFFICIAL_FAIR_URL,
      officialPurchaseUrl: STORY_ADMISSION_URL,
      validDates: { startsOn: "2026-09-18", endsOn: "2026-09-18" },
      pastKnownDeadline: false,
      placement: "calculator",
    },
    {
      id: "offer-adult-admission-online",
      label: "Adult admission online",
      priceLabel: "$10",
      detail: "Guests who are 11 or older can use this admission.",
      officialInfoUrl: OFFICIAL_FAIR_URL,
      officialPurchaseUrl: STORY_ADMISSION_URL,
      deadlineAt: null,
      validDates: STORY_FULL_FAIR_DATES,
      pastKnownDeadline: false,
      placement: "calculator",
    },
    {
      id: "offer-child-admission",
      label: "Child admission",
      priceLabel: "Free",
      detail: "Fair admission is free for guests age 10 and under.",
      officialInfoUrl: OFFICIAL_FAIR_URL,
      officialPurchaseUrl: null,
      deadlineAt: null,
      validDates: STORY_FULL_FAIR_DATES,
      pastKnownDeadline: false,
      placement: "calculator",
    },
    {
      id: "offer-blue-ribbon-bundle",
      label: "Blue Ribbon Bundle",
      priceLabel: "$80",
      detail: "The bundle includes ten online admissions.",
      officialInfoUrl: OFFICIAL_FAIR_URL,
      officialPurchaseUrl: STORY_ADMISSION_URL,
      deadlineAt: null,
      validDates: STORY_FULL_FAIR_DATES,
      pastKnownDeadline: false,
      placement: "calculator",
    },
    {
      id: "offer-jack-pass",
      label: "Jack Pass",
      priceLabel: "$35",
      detail: "One admission and one ride-all-day wristband.",
      deadlineLabel: "Official sales end September 18 at 5:00 PM.",
      deadlineAt: "2026-09-18T17:00:00-04:00",
      officialInfoUrl: OFFICIAL_FAIR_URL,
      officialPurchaseUrl: STORY_JACK_URL,
      validDates: STORY_FULL_FAIR_DATES,
      pastKnownDeadline: false,
      placement: "calculator",
    },
    {
      id: "offer-carload-special",
      label: "Tuesday carload",
      priceLabel: "$60",
      detail: "Lot D parking, admission, and ride wristbands for up to eight buckled passengers on September 22.",
      officialInfoUrl: OFFICIAL_FAIR_URL,
      officialPurchaseUrl: STORY_CARLOAD_URL,
      deadlineAt: "2026-09-22T19:00:00-04:00",
      validDates: { startsOn: "2026-09-22", endsOn: "2026-09-22" },
      pastKnownDeadline: false,
      placement: "calculator",
    },
  ],
  partyOffers: storyPartyOffers,
  practicalAnswers: greatFrederickFair2026PracticalAnswers,
  accessHighlights: [
    {
      id: "access-sensory-friendly-carnival",
      date: "2026-09-20",
      title: "Sensory-friendly carnival · noon–2 p.m.",
      detail:
        "The carnival lowers its lights and music during this window. The Fair does not describe this as a whole-ground low-sensory period.",
      answerId: "fair-answer-sensory-friendly-carnival",
    },
  ],
  arrivalOptions: [
    {
      id: "arrival-drive",
      planChoice: "drive",
      label: "Drive and park",
      summary:
        "Use I-70 Exit 56. Infield parking costs $15 and accepts cash or credit card. Lots A through D cost $10 and accept cash. Parking is not sold in advance. A free ADA-compliant shuttle runs from Lot D to Gate 4A. This is a Fair parking shuttle, not county Transit.",
      paymentLabel: "$15 infield or $10 in Lots A through D.",
      returnLabel: "Return to your saved parking lot",
      returnSummary:
        "Save the lot and entrance you used before entering. Radius does not calculate an inside-the-Fairgrounds travel time.",
      officialInfoUrl: OFFICIAL_VISIT_URL,
    },
    {
      id: "arrival-transit",
      planChoice: "transit",
      label: "County Transit",
      summary: fairTransitTravelSummary(),
      paymentLabel:
        "County Transit is fare-free. Radius checked the published static Fair-week schedule on September 4.",
      returnLabel: "Recheck county Transit before leaving",
      returnSummary:
        "Static departure times can change. Check County Transit again before the return trip.",
      officialInfoUrl: greatFrederickFair2026TransitReview.informationUrl,
    },
    {
      id: "arrival-dropoff",
      planChoice: "drop-off",
      label: "Gate 4A drop-off",
      summary:
        "The official Fair guidance identifies the Gate 4A pull-off for general rideshare and drop-off.",
      paymentLabel: "No reviewed parking payment applies to this drop-off option.",
      returnLabel: "Return to the Gate 4A pick-up point",
      returnSummary:
        "Confirm the pick-up point with your driver before entering. Radius does not publish a pick-up time.",
      officialInfoUrl: OFFICIAL_VISIT_URL,
    },
  ],
  parkingGlance: {
    satellitePriceLabel: "$10",
    satellitePaymentLabel: "cash",
    infieldPriceLabel: "$15",
    infieldPaymentLabel: "cash or credit card",
  },
  entrySummary:
    "Adult admission is $10 online or $15 at the gate. Apple Pay is not accepted.",
  entryDetail:
    "Keep another accepted payment method ready. Radius leaves the entrance gate unset until an official source or on-site sign confirms it.",
  ticketWalletHelpUrl:
    "https://support.etix.com/general-info/what-is-etix-wallet-and-how-do-i-use-it",
  externalGuide: {
    label: "Official external EventHub guide",
    detail:
      "The Fair links to EventHub for its 2026 vendor floorplan and exhibitor directory. Radius opens it as an external guide and does not treat that floorplan as reviewed map geometry.",
    url: "https://mobile.eventhub-floorplan.net/?Show_ID=18209",
  },
  scheduleItems: storyScheduleItems,
  initialPlan: storyPlan,
  source: {
    label: "Official Fair program and visitor information",
    sourceUrl: OFFICIAL_FAIR_URL,
    checkedLabel: "August 29, 2026 at 8:52 AM",
    ageLabel: "This imported program version is 3 days old",
  },
};

const meta = {
  title: "Fair/FairDayWorkspace",
  component: FairDayWorkspace,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The Fair Day planning workspace. It server-renders official source facts, then hydrates the device-local readiness and plan controls.",
      },
    },
  },
  args: { data: fairDayStoryData },
} satisfies Meta<typeof FairDayWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mobile390: Story = {
  globals: {
    viewport: { value: "radiusMobile", isRotated: false },
  },
};

export const Narrow320: Story = {
  globals: {
    viewport: { value: "radiusMobileNarrow", isRotated: false },
  },
};

export const NoProgramResults: Story = {
  args: {
    data: {
      ...fairDayStoryData,
      scheduleItems: [],
      initialPlan: createFairPlan({
        fairId: "great-frederick-fair-2026",
        packRevision: STORY_REVISION,
        now: STORY_NOW,
        selectedDayId: "day-2026-09-18",
      }),
    },
  },
};
