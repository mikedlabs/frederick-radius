import type { FairPack, FairPackPointer } from "@/lib/fair/pack";
import { buildFairPartyOffers } from "@/lib/fair/party-plan";
import { createFairPlan } from "@/lib/fair/plan";
import type { FairScheduleSourceItem } from "@/lib/fair/schedule";
import { greatFrederickFair2026PracticalAnswers } from "@/data/fair/great-frederick-fair-2026-practical-answers";

import type {
  FairDayAccessHighlight,
  FairDayArrivalView,
  FairDayScheduleItemView,
  FairDayWorkspaceData,
} from "./types";

const FAIR_TIME_ZONE = "America/New_York";
const COUNTY_TRANSIT_INFO_URL =
  "https://www.frederickcountymd.gov/105/Transit-Services";
const ETIX_WALLET_HELP_URL =
  "https://support.etix.com/general-info/what-is-etix-wallet-and-how-do-i-use-it";
const EVENTHUB_GUIDE_URL =
  "https://mobile.eventhub-floorplan.net/?Show_ID=18209";

function moneyLabel(amountCents: number): string {
  if (amountCents === 0) return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}

function clockLabel(timestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: FAIR_TIME_ZONE,
    hour: "numeric",
  }).format(new Date(timestamp));
}

function checkedLabel(timestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: FAIR_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function fairDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function offerValidityLabel(
  validDates: FairPack["offers"][number]["validDates"],
): string {
  if (validDates.status === "unknown") {
    return "The official sources reviewed for this pack do not confirm the valid dates.";
  }
  if (validDates.startsOn === validDates.endsOn) {
    return `This offer is valid on ${fairDateLabel(validDates.startsOn)}.`;
  }
  return `This offer is valid from ${fairDateLabel(validDates.startsOn)} through ${fairDateLabel(validDates.endsOn)}.`;
}

function sourceAgeLabel(timestamp: string, asOf: Date): string {
  const elapsedMs = Math.max(0, asOf.getTime() - Date.parse(timestamp));
  const days = Math.floor(elapsedMs / 86_400_000);
  if (days === 0) return "The source was checked today";
  if (days === 1) return "The source was checked 1 day ago";
  return `The source was checked ${days} days ago`;
}

function fairLocalDate(asOf: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FAIR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(asOf);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function scheduleKind(
  item: FairScheduleSourceItem,
): FairDayScheduleItemView["kind"] {
  const text = item.text.toLocaleLowerCase();
  if (
    /\b(?:alpacas?|cattle|dairy|dogs?|goats?|horses?|livestock|llamas?|pigs?|poultry|rabbits?|sheep|swine|turkeys?)\b/.test(
      text,
    )
  ) {
    return "animal";
  }
  if (
    /\b(?:food|bake|baked|cooking|cake|pie|culinary|chef|beer garden|winery|wineries|brewery|breweries|distillery|distilleries)\b/.test(
      text,
    )
  ) {
    return "food";
  }
  if (/\b(?:agriculture|agricultural|farm|garden|landscape|produce)\b/.test(text)) {
    return "agriculture";
  }
  if (/\b(?:tractor|truck|motorsport|demolition)\b/.test(text)) {
    return "motorsport";
  }
  if (/\b(?:concert|music|band|choir|singer)\b/.test(text)) return "concert";
  if (/\b(?:carnival|ride|midway)\b/.test(text)) return "carnival";
  if (/\b(?:first aid|guest services|security)\b/.test(text)) return "service";
  return "other";
}

function scheduleCopy(text: string): { title: string; detail?: string } {
  const normalized = text.replace(/\s+/g, " ").replace(/^\|\s*/, "").trim();
  const displayText = normalized
    .replace(
      /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s|]*)?/giu,
      "",
    )
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim() || normalized;
  const sections = displayText
    .split(/\s+\|\s+|\s+-\s+/u)
    .map((section) => section.trim())
    .filter(Boolean);
  const firstSectionCandidate = sections[0] ?? displayText;
  const colonIndex = firstSectionCandidate.indexOf(": ");
  const colonSections =
    colonIndex >= 3 && colonIndex <= 80
      ? [
          firstSectionCandidate.slice(0, colonIndex),
          firstSectionCandidate.slice(colonIndex + 2),
          ...sections.slice(1),
        ]
      : sections;
  const firstSection = colonSections[0] ?? displayText;

  if (
    colonSections.length > 1 &&
    firstSection.length >= 3 &&
    firstSection.length <= 80
  ) {
    const detail = colonSections
      .slice(1)
      .join(" · ")
      .replace(/\s*~\s*/g, " · ")
      .replace(/[{}]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return detail ? { title: firstSection, detail } : { title: firstSection };
  }

  const beforeLongQualifier = firstSection;
  const breakAt = beforeLongQualifier.lastIndexOf(" ", 116);
  const title =
    beforeLongQualifier.length > 120
      ? `${beforeLongQualifier.slice(0, Math.max(80, breakAt)).trim()}…`
      : beforeLongQualifier;

  return title === displayText ? { title } : { title, detail: displayText };
}

function explicitPlaces(text: string): string[] {
  const numberedPlaces = text.match(
    /\b(?:Bldg\.?|Building|Gate)\s*(?:#\s*)?\d+[A-Za-z]?\b/gi,
  );
  const namedPlaces = text
    .split(/\s+-\s+/u)
    .map((section) =>
      section
        .split(/\s*~\s*/u)[0]
        ?.replace(/\s*\(\$\)\s*/g, "")
        .trim(),
    )
    .filter(
      (section): section is string =>
        Boolean(section) &&
        section.length <= 120 &&
        /\b(?:Arena|Grandstand|Horse Park|Infield|Stage|Tent)\b/i.test(section),
    );
  const reviewedNamedMentions =
    (numberedPlaces?.length ?? 0) + namedPlaces.length === 0
      ? text.match(/\b(?:Grandstand|Household Building|The Null Bldg\.?)\b/gi)
      : null;
  const places = Array.from(
    new Set([
      ...(numberedPlaces ?? []),
      ...(reviewedNamedMentions ?? []),
      ...namedPlaces,
    ]),
  );
  const hasHouseholdBuilding = places.some((place) =>
    /\bHousehold Building\b/i.test(place),
  );
  return hasHouseholdBuilding
    ? places.filter((place) => !/\bThe Null Bldg\.?\b/i.test(place))
    : places;
}

function explicitPlaceLabel(text: string): string {
  const places = explicitPlaces(text);
  if (places.length === 0) {
    return "The official schedule does not publish a separate place field.";
  }
  return `Published place: ${places.join(", ")}.`;
}

function detailWithoutRepeatedPlaces(
  detail: string | undefined,
  places: string[],
): string | undefined {
  if (!detail || places.length === 0) return detail;
  const normalize = (value: string) =>
    value
      .toLocaleLowerCase()
      .replace(/\bbuilding\b/g, "bldg")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const normalizedPlaces = places.map(normalize);
  const remaining = detail
    .split(" · ")
    .filter(
      (section) => !normalizedPlaces.includes(normalize(section)),
    )
    .join(" · ")
    .trim();
  return remaining || undefined;
}

function scheduleTimeLabel(item: FairScheduleSourceItem): string {
  if (item.timeLabel) return item.timeLabel;
  if (item.inheritedTimeLabel) return item.inheritedTimeLabel;
  return /\b(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)(?=\s|[;,.)]|$)/i.test(
    item.text,
  )
    ? "Times listed in item"
    : "Time not published";
}

function scheduleView(item: FairScheduleSourceItem): FairDayScheduleItemView {
  const copy = scheduleCopy(item.text);
  const places = explicitPlaces(item.text);
  return {
    id: item.id,
    date: item.fairDate,
    title: copy.title,
    detail: detailWithoutRepeatedPlaces(copy.detail, places),
    timeLabel: scheduleTimeLabel(item),
    placeLabel:
      places.length > 0
        ? `Published place: ${places.join(", ")}.`
        : explicitPlaceLabel(item.text),
    kind: scheduleKind(item),
    sourceUrl: item.sourceUrl,
    sourceItem: item,
  };
}

function visitSourceUrl(pack: FairPack): string {
  return (
    pack.manifest.lots
      .flatMap((lot) => lot.provenance)
      .find((source) => source.sourceTitle === "Plan Your Visit")?.sourceUrl ??
    pack.provenance.manifestSourceUrls[0]
  );
}

function arrivalViews(pack: FairPack): FairDayArrivalView[] {
  const sourceUrl = visitSourceUrl(pack);
  const infield = pack.manifest.lots.find((lot) => lot.id === "lot-infield");
  const satelliteLots = pack.manifest.lots.filter((lot) =>
    ["lot-a", "lot-b", "lot-c", "lot-d"].includes(lot.id),
  );
  const lotD = pack.manifest.lots.find((lot) => lot.id === "lot-d");
  const infieldPrice =
    infield?.vehicleRate.status === "known"
      ? moneyLabel(infield.vehicleRate.amountCents)
      : "an unpublished price";
  const satellitePrice =
    satelliteLots[0]?.vehicleRate.status === "known"
      ? moneyLabel(satelliteLots[0].vehicleRate.amountCents)
      : "an unpublished price";
  const infieldPayment =
    infield?.paymentMethods.status === "known"
      ? infield.paymentMethods.value.join(" or ")
      : "an unpublished payment method";
  const satellitePayment =
    satelliteLots[0]?.paymentMethods.status === "known"
      ? satelliteLots[0].paymentMethods.value.join(" or ")
      : "an unpublished payment method";
  const shuttleFact =
    lotD?.shuttle.status === "known"
      ? ` ${lotD.shuttle.value} This is a Fair parking shuttle, not county Transit.`
      : "";

  const views: FairDayArrivalView[] = [
    {
      id: "arrival-drive",
      planChoice: "drive",
      label: "Drive and park",
      summary: `Use I-70 Exit 56. Infield parking costs ${infieldPrice} and accepts ${infieldPayment}. Lots A through D cost ${satellitePrice} and accept ${satellitePayment}. Regular parking is not sold in advance.${shuttleFact}`,
      paymentLabel: `${infieldPrice} infield or ${satellitePrice} in Lots A through D.`,
      returnLabel: "Return to your saved parking lot",
      returnSummary:
        "Save the lot and entrance you used before entering. Radius does not publish an inside-the-Fairgrounds travel time.",
      officialInfoUrl: sourceUrl,
    },
  ];

  const featuredStop = pack.transit.featuredStop;
  if (featuredStop) {
    const routeLabels = featuredStop.routes.map((route) => route.short);
    const routeText =
      routeLabels.length > 0
        ? `The reviewed static feed associates ${featuredStop.name} with ${routeLabels.join(" and ")}.`
        : `The reviewed static feed includes ${featuredStop.name}, but it does not publish a route association in this pack.`;
    views.push({
      id: "arrival-transit-context",
      planChoice: "transit",
      label: "County Transit",
      summary: `${routeText} This is static network context, not a service promise. Service on Fair dates is not confirmed, and arrival times are not confirmed.`,
      paymentLabel:
        "County Transit is fare-free. Check Fair-date service before relying on this option.",
      returnLabel: "Recheck county Transit before leaving",
      returnSummary:
        "Radius has no confirmed Fair-date service or arrival time for this stop.",
      officialInfoUrl: COUNTY_TRANSIT_INFO_URL,
    });
  }

  const dropOff = pack.manifest.accessFacts.find(
    (fact) => fact.kind === "accessible-drop-off" && fact.state.status === "known",
  );
  if (dropOff?.state.status === "known") {
    views.push({
      id: "arrival-drop-off",
      planChoice: "drop-off",
      label: "Drop-off",
      summary: dropOff.state.value,
      paymentLabel: "No reviewed parking payment applies to this drop-off option.",
      returnLabel: "Confirm the pick-up point before entering",
      returnSummary:
        "Radius does not publish a pick-up time. Confirm the return point with your driver.",
      officialInfoUrl: dropOff.provenance[0]?.sourceUrl ?? sourceUrl,
    });
  }

  return views;
}

function entryCopy(pack: FairPack): {
  entrySummary: string;
  entryDetail: string;
} {
  const adult = pack.manifest.admissionTiers.find(
    (tier) => tier.id === "admission-adults-11-plus",
  );
  const online = adult?.prices.find((price) => price.channel === "online");
  const gate = adult?.prices.find((price) => price.channel === "gate");
  const summary =
    online && gate
      ? `Adult admission is ${moneyLabel(online.amountCents)} online and ${moneyLabel(gate.amountCents)} at the gate.`
      : "The current Fair pack does not include a complete adult admission comparison.";
  return {
    entrySummary: summary,
    entryDetail:
      "Apple Pay is not accepted. Keep another payment method ready. The reviewed Fair pack does not name an entrance gate, so check the official source and on-site signs before entering.",
  };
}

function accessHighlights(pack: FairPack): FairDayAccessHighlight[] {
  const sensoryWindow = pack.manifest.accessFacts.find(
    (fact) =>
      fact.id === "access-sensory-friendly-carnival" &&
      fact.kind === "sensory-friendly-hours" &&
      fact.state.status === "known",
  );
  if (!sensoryWindow || sensoryWindow.state.status !== "known") return [];
  const sensoryDetail = sensoryWindow.state.value;

  return sensoryWindow.relatedEntityIds.flatMap((entityId) => {
    if (!entityId.startsWith("day-")) return [];
    return [
      {
        id: sensoryWindow.id,
        date: entityId.slice("day-".length),
        title: "Sensory-friendly carnival · noon–2 p.m.",
        detail: sensoryDetail,
        answerId: "fair-answer-sensory-friendly-carnival",
      },
    ];
  });
}

export function buildFairDayWorkspaceData(
  pack: FairPack,
  pointer: FairPackPointer,
  asOf: Date,
): FairDayWorkspaceData {
  const scheduleItems = pack.schedule.days.flatMap((day) =>
    day.items.map(scheduleView),
  );
  const firstDay = pack.schedule.days[0];
  const todayAtFair = fairLocalDate(asOf);
  const initialDay =
    pack.schedule.days.find((day) => day.date === todayAtFair) ?? firstDay;
  const entry = entryCopy(pack);
  const eventPhase =
    todayAtFair < pack.manifest.startsOn
      ? "pre-fair"
      : todayAtFair > pack.manifest.endsOn
        ? "post-fair"
        : "fair-day";
  const partyOffers = buildFairPartyOffers(pack.offers, asOf.toISOString());
  const partyOfferIds = new Set(partyOffers.map((offer) => offer.id));

  return {
    fairId: pack.fairId,
    packRevision: pointer.revision,
    eventName: pack.manifest.title,
    dateRangeLabel: "September 18 through 26",
    yearLabel: pack.manifest.startsOn.slice(0, 4),
    disclosure:
      "Radius is an independent local guide. Fair details come from official Fair sources linked below.",
    eventPhase,
    reviewedAt: asOf.toISOString(),
    eventPhaseLabel:
      eventPhase === "pre-fair"
        ? "Before the Fair"
        : eventPhase === "fair-day"
          ? "Fair day"
          : "Fair details",
    dates: pack.schedule.days.map((day) => ({
      date: day.date,
      weekdayLabel: new Intl.DateTimeFormat("en-US", {
        timeZone: FAIR_TIME_ZONE,
        weekday: "short",
      }).format(new Date(`${day.date}T12:00:00-04:00`)),
      dayLabel: String(Number(day.date.slice(-2))),
      gateHoursLabel: clockLabel(day.gateStartsAt),
      gateClosesAt: day.gateEndsAt,
    })),
    initialDate: initialDay.date,
    offers: pack.offers.map((offer) => ({
      id: offer.id,
      label: offer.label,
      priceLabel:
        offer.price.status === "known"
          ? moneyLabel(offer.price.amountCents)
          : "Price not published",
      detail:
        offer.inclusions.status === "known"
          ? `${offer.inclusions.value.join(", ")}. ${offer.eligibility} ${offerValidityLabel(offer.validDates)}`
          : `${offer.eligibility} ${offer.inclusions.reason} ${offerValidityLabel(offer.validDates)}`,
      deadlineLabel:
        offer.deadline.status === "known"
          ? `The official purchase deadline is ${checkedLabel(offer.deadline.value)}.`
          : undefined,
      deadlineAt:
        offer.deadline.status === "known" ? offer.deadline.value : null,
      validDates:
        offer.validDates.status === "known"
          ? {
              startsOn: offer.validDates.startsOn,
              endsOn: offer.validDates.endsOn,
            }
          : null,
      pastKnownDeadline:
        offer.deadline.status === "known" &&
        asOf.getTime() >= Date.parse(offer.deadline.value),
      placement: partyOfferIds.has(offer.id)
        ? "calculator"
        : offer.kind === "deal"
          ? "eligibility-promotion"
          : "standard",
      officialInfoUrl: offer.officialInfoUrl,
      officialPurchaseUrl:
        offer.officialPurchaseUrl.status === "known"
          ? offer.officialPurchaseUrl.value
          : null,
    })),
    partyOffers,
    practicalAnswers: greatFrederickFair2026PracticalAnswers,
    accessHighlights: accessHighlights(pack),
    arrivalOptions: arrivalViews(pack),
    ...entry,
    ticketWalletHelpUrl: ETIX_WALLET_HELP_URL,
    externalGuide: {
      label: "Official external EventHub guide",
      detail:
        "The Fair links to EventHub for its 2026 vendor floorplan and exhibitor directory. Radius opens it as an external guide and does not treat that floorplan as reviewed map geometry.",
      url: EVENTHUB_GUIDE_URL,
    },
    scheduleItems,
    initialPlan: createFairPlan({
      fairId: pack.fairId,
      packRevision: pointer.revision,
      now: pack.contentUpdatedAt,
      selectedDayId: initialDay.id,
    }),
    source: {
      label: `Official Fair data pack with ${pointer.itemCount} program rows`,
      sourceUrl: pack.provenance.scheduleSourceUrl,
      checkedLabel: checkedLabel(pack.contentUpdatedAt),
      ageLabel: sourceAgeLabel(pack.contentUpdatedAt, asOf),
    },
  };
}
