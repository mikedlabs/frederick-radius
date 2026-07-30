import type {
  AskResult,
  AskSource,
} from "@/lib/ask/contracts";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import {
  FC_PLANNING_PROJECTS_SOURCE,
  type CountyPlanningApplication,
} from "@/lib/integrations/fcPlanningProjects";
import type {
  CountyDataSnapshot,
  CountyPolygonGeometry,
} from "@/lib/integrations/fcCountySource";
import {
  MUNICIPALITIES,
  type Municipality,
} from "@/data/municipalities";

type PlanningAskContext = {
  label?: string | null;
  origin?: LngLat | null;
  canShowDistance?: boolean;
  query?: string | null;
};

const EXPLICIT_PLANNING_RE =
  /\b(?:planning applications?|development proposals?|proposed developments?|zoning cases?|subdivisions?|site plans?|land[-\s]?use applications?)\b/i;
const BUILT_RE =
  /\b(?:what(?:'s| is) being built|what are they building|construction projects?|new development)\b/i;
const ROAD_CONTEXT_RE =
  /\b(?:road|roads|traffic|lane|lanes|highway|interstate|route|work zone)\b/i;

export function wantsCountyPlanningApplications(query: string): boolean {
  if (EXPLICIT_PLANNING_RE.test(query)) return true;
  return BUILT_RE.test(query) && !ROAD_CONTEXT_RE.test(query);
}

function requestedMunicipality(query: string | null | undefined): Municipality | null {
  const normalized = query?.toLowerCase() ?? "";
  if (!normalized) return null;
  for (const municipality of MUNICIPALITIES) {
    const matches =
      municipality.slug === "frederick"
        ? /\b(?:frederick city|downtown frederick)\b/i.test(normalized)
        : municipality.slug === "mount-airy"
          ? /\b(?:mount|mt\.?)\s*airy\b/i.test(normalized)
          : new RegExp(
              `\\b${municipality.slug.replace(/-/g, "[ -]")}\\b`,
              "i",
            ).test(normalized);
    if (matches) return municipality;
  }
  return null;
}

function insideTownBox(point: LngLat, municipality: Municipality): boolean {
  const [west, south, east, north] = municipality.bbox;
  return (
    point.lng >= west &&
    point.lng <= east &&
    point.lat >= south &&
    point.lat <= north
  );
}

function polygonAnchor(
  geometry: CountyPolygonGeometry,
): LngLat | null {
  const points: Array<[number, number]> = [];
  const collect = (value: unknown): void => {
    if (
      Array.isArray(value)
      && value.length >= 2
      && typeof value[0] === "number"
      && typeof value[1] === "number"
    ) {
      points.push([value[0], value[1]]);
      return;
    }
    if (Array.isArray(value)) value.forEach(collect);
  };
  collect(geometry.coordinates);
  if (points.length === 0) return null;
  const bounds = points.reduce(
    (acc, [lng, lat]) => ({
      west: Math.min(acc.west, lng),
      east: Math.max(acc.east, lng),
      south: Math.min(acc.south, lat),
      north: Math.max(acc.north, lat),
    }),
    {
      west: Number.POSITIVE_INFINITY,
      east: Number.NEGATIVE_INFINITY,
      south: Number.POSITIVE_INFINITY,
      north: Number.NEGATIVE_INFINITY,
    },
  );
  if (!Object.values(bounds).every(Number.isFinite)) return null;
  return {
    lng: (bounds.west + bounds.east) / 2,
    lat: (bounds.south + bounds.north) / 2,
  };
}

function milestoneLine(application: CountyPlanningApplication): string | undefined {
  const parts = [
    application.milestone,
    application.milestoneAt
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "America/New_York",
        }).format(new Date(application.milestoneAt))
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function officialOnlyResult(
  availability: "disabled" | "unavailable",
  context: PlanningAskContext,
): AskResult {
  const reason =
    availability === "disabled"
      ? "Radius has not enabled transformed application records"
      : "The application feed could not be loaded";
  return {
    status: "matches",
    configured: true,
    usedModel: false,
    answer:
      availability === "disabled"
        ? "Radius cannot rank County planning applications here yet. Use the official County planning map for current records."
        : "I couldn’t load the County planning application feed. Use the official County planning map for current records.",
    context: context.label ?? "Frederick County",
    sources: [{
      slug: "frederick-county-planning-map",
      name: "Frederick County planning applications",
      category: "planning",
      city: "Frederick County",
      href: FC_PLANNING_PROJECTS_SOURCE.sourceUrl,
      eyebrow: "Official County map",
      reason,
      detail:
        "An application record is not proof of approval or active construction.",
      confidence: "medium",
    }],
    actions: [{
      label: "Open the County planning map",
      kind: "open",
      href: FC_PLANNING_PROJECTS_SOURCE.sourceUrl,
    }],
    intelligence: {
      tools: ["planning-gis"],
      confidence: "medium",
      retrieval: "keyword",
    },
  };
}

export function countyPlanningAskResult(
  snapshot: CountyDataSnapshot<CountyPlanningApplication> | null,
  context: PlanningAskContext = {},
): AskResult {
  if (!snapshot || snapshot.availability === "unavailable") {
    return officialOnlyResult("unavailable", context);
  }
  if (snapshot.availability === "disabled") {
    return officialOnlyResult("disabled", context);
  }

  const queryTown = requestedMunicipality(context.query);
  const rankingOrigin = queryTown?.centroid ?? context.origin ?? null;
  const contextLabel = queryTown?.name ?? context.label ?? "Frederick County";
  const allRanked = snapshot.records
    .map((application) => {
      const anchor = polygonAnchor(application.geometry);
      const distance =
        rankingOrigin && anchor
          ? haversineMeters(rankingOrigin, anchor)
          : null;
      return { application, anchor, distance };
    });
  const ranked = (queryTown
    ? allRanked.filter(
        (candidate) =>
          candidate.anchor && insideTownBox(candidate.anchor, queryTown),
      )
    : allRanked)
    .sort((a, b) => {
      if (a.distance != null && b.distance != null) {
        return a.distance - b.distance;
      }
      if (a.distance != null) return -1;
      if (b.distance != null) return 1;
      const aMilestone = Date.parse(a.application.milestoneAt ?? "");
      const bMilestone = Date.parse(b.application.milestoneAt ?? "");
      return (
        (Number.isFinite(bMilestone) ? bMilestone : 0)
          - (Number.isFinite(aMilestone) ? aMilestone : 0)
        || a.application.name.localeCompare(b.application.name)
      );
    });

  const sources: AskSource[] = ranked.slice(0, 4).map(
    ({ application, distance }) => ({
      slug: application.id,
      name: application.name,
      category: "planning",
      city: "Frederick County",
      href: application.detailsUrl ?? snapshot.provenance.sourceUrl,
      eyebrow: "Open planning application",
      reason:
        queryTown
          ? `This application is mapped in the ${queryTown.name} area.`
          : context.canShowDistance !== false && distance != null
          ? `${formatDistance(distance)} from ${contextLabel}`
          : application.milestone ?? "Open application",
      detail: [
        application.applicationType,
        "Not proof of approval or active construction.",
      ].filter(Boolean).join(" · "),
      status: milestoneLine(application),
      confidence: "medium",
    }),
  );

  const lead = ranked[0];
  const answer =
    lead
      ? `${ranked.length} open County planning application${ranked.length === 1 ? "" : "s"} ${queryTown ? `map to the ${queryTown.name} area` : "are in the current layer"}. ${lead.application.name} ranks first${!queryTown && context.canShowDistance !== false && lead.distance != null ? ` at ${formatDistance(lead.distance)} from ${contextLabel}` : ""}. An open application is not proof of approval or active construction.`
      : queryTown
        ? `The current County layer returned no open planning applications in the ${queryTown.name} area. Open the official map before relying on that result.`
        : "The County layer returned no open planning applications. Open the official map before relying on that result.";

  const leadMapAction =
    lead?.anchor
      ? [{
          label: "Show the lead area on the map",
          kind: "open" as const,
          href: `/map?at=${lead.anchor.lat.toFixed(6)},${lead.anchor.lng.toFixed(6)}`,
        }]
      : [];

  return {
    status: sources.length > 0 ? "matches" : "empty",
    configured: true,
    usedModel: false,
    answer,
    context: contextLabel,
    sources,
    actions: [
      ...leadMapAction,
      {
        label: "Open the County planning map",
        kind: "open",
        href: snapshot.provenance.sourceUrl,
      },
    ],
    intelligence: {
      tools: ["planning-gis"],
      confidence: "medium",
      retrieval: "keyword",
    },
  };
}
