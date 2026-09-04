import type { FairPlan, FairPlanArrivalChoice } from "@/lib/fair/plan";
import type { FairPartyOffer } from "@/lib/fair/party-plan";
import type { FairPracticalAnswer } from "@/lib/fair/practical-answers";
import type { FairScheduleSourceItem } from "@/lib/fair/schedule";

export type FairDayDateOption = {
  date: string;
  weekdayLabel: string;
  dayLabel: string;
  gateHoursLabel: string;
  gateClosesAt: string;
};

export type FairDayOfferView = {
  id: string;
  label: string;
  priceLabel: string;
  detail: string;
  officialInfoUrl: string;
  officialPurchaseUrl: string | null;
  deadlineLabel?: string;
  deadlineAt: string | null;
  validDates: { startsOn: string; endsOn: string } | null;
  pastKnownDeadline: boolean;
  placement: "calculator" | "standard" | "eligibility-promotion";
};

export type FairDayArrivalView = {
  id: string;
  planChoice: FairPlanArrivalChoice;
  label: string;
  summary: string;
  paymentLabel: string;
  returnLabel: string;
  returnSummary: string;
  officialInfoUrl: string;
};

export type FairDayScheduleItemView = {
  id: string;
  date: string;
  title: string;
  detail?: string;
  timeLabel: string;
  placeLabel: string;
  kind: "agriculture" | "animal" | "carnival" | "concert" | "exhibit" | "food" | "motorsport" | "service" | "other";
  sourceUrl: string;
  sourceItem: FairScheduleSourceItem;
};

export type FairDaySourceView = {
  label: string;
  sourceUrl: string;
  checkedLabel: string;
  ageLabel: string;
};

export type FairDayExternalGuideView = {
  label: string;
  detail: string;
  url: string;
};

export type FairDayAccessHighlight = {
  id: string;
  date: string;
  title: string;
  detail: string;
  answerId: string;
};

export type FairDayWorkspaceData = {
  fairId: string;
  packRevision: string;
  eventName: string;
  dateRangeLabel: string;
  yearLabel: string;
  disclosure: string;
  eventPhase: "pre-fair" | "fair-day" | "post-fair";
  eventPhaseLabel: string;
  reviewedAt: string;
  dates: FairDayDateOption[];
  initialDate: string;
  offers: FairDayOfferView[];
  partyOffers: FairPartyOffer[];
  practicalAnswers: FairPracticalAnswer[];
  accessHighlights: FairDayAccessHighlight[];
  arrivalOptions: FairDayArrivalView[];
  entrySummary: string;
  entryDetail: string;
  ticketWalletHelpUrl: string;
  externalGuide: FairDayExternalGuideView;
  scheduleItems: FairDayScheduleItemView[];
  initialPlan: FairPlan;
  source: FairDaySourceView;
};
