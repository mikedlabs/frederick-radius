export type DataToolActivationStatus =
  "active" | "disabled" | "missing_configuration";

export type DataToolEnvironment = Readonly<Record<string, string | undefined>>;

type EnvironmentRequirement =
  { env: string; equals?: string } | { anyOf: readonly string[] };

export type DataToolDefinition = {
  id: string;
  label: string;
  note?: string;
  scope: "vercel" | "runtime" | "operator";
  gate?: { env: string; equals?: string };
  requirements?: readonly EnvironmentRequirement[];
  vercelPath?: string;
  /** Optional tools are deliberately disabled when their credentials are absent. */
  optionalWhenUnconfigured?: boolean;
};

export type DataToolStatus = {
  id: string;
  label: string;
  note?: string;
  scope: DataToolDefinition["scope"];
  status: DataToolActivationStatus;
  gate?: string;
  vercelPath?: string;
  schedule?: string;
  missing: string[];
};

const DATABASE_REQUIREMENT: EnvironmentRequirement = {
  anyOf: ["DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL"],
};

const PUSH_REQUIREMENTS: readonly EnvironmentRequirement[] = [
  { env: "VAPID_PUBLIC_KEY" },
  { env: "VAPID_PRIVATE_KEY" },
  { env: "VAPID_SUBJECT" },
];

const CRON_REQUIREMENT: EnvironmentRequirement = { env: "CRON_SECRET" };

/**
 * Scheduled and explicitly gated data capabilities whose activation state is
 * otherwise easy to misread from a green deployment or cron invocation.
 *
 * Keep this list declarative and side-effect free. The CLI may safely run in
 * CI or against a local env file: it never imports provider clients and never
 * prints environment values.
 */
export const DATA_TOOL_DEFINITIONS: readonly DataToolDefinition[] = [
  {
    id: "event-archive",
    label: "Durable event archive",
    scope: "vercel",
    vercelPath: "/api/cron/event-archive",
    requirements: [CRON_REQUIREMENT, DATABASE_REQUIREMENT],
  },
  {
    id: "civicengage-ingest",
    label: "CivicEngage event ingest",
    scope: "vercel",
    vercelPath: "/api/ingest/civicengage",
    requirements: [CRON_REQUIREMENT, DATABASE_REQUIREMENT],
  },
  {
    id: "library-ingest",
    label: "Library event ingest",
    scope: "vercel",
    vercelPath: "/api/ingest/fcpl",
    requirements: [CRON_REQUIREMENT, DATABASE_REQUIREMENT],
  },
  {
    id: "fcvfra-ingest",
    label: "Fire and rescue event ingest",
    scope: "vercel",
    vercelPath: "/api/ingest/fcvfra",
    requirements: [CRON_REQUIREMENT, DATABASE_REQUIREMENT],
  },
  {
    id: "data-health-feeds",
    label: "Feed snapshot health",
    scope: "vercel",
    vercelPath: "/api/cron/data-health-feeds",
    requirements: [CRON_REQUIREMENT, DATABASE_REQUIREMENT],
  },
  {
    id: "runtime-source-health",
    label: "Runtime source health",
    scope: "vercel",
    vercelPath: "/api/cron/runtime-source-health",
    requirements: [CRON_REQUIREMENT, DATABASE_REQUIREMENT],
  },
  {
    id: "data-health",
    label: "Combined data health",
    scope: "vercel",
    vercelPath: "/api/cron/data-health",
    requirements: [CRON_REQUIREMENT, DATABASE_REQUIREMENT],
  },
  {
    id: "food-truck-schedules",
    label: "Food-truck schedule refresh",
    scope: "vercel",
    vercelPath: "/api/cron/food-truck-schedules",
    requirements: [CRON_REQUIREMENT, { env: "BLOB_READ_WRITE_TOKEN" }],
  },
  {
    id: "scanner-archive",
    label: "Scanner incident archive",
    scope: "vercel",
    vercelPath: "/api/cron/scanner-archive",
    requirements: [CRON_REQUIREMENT, DATABASE_REQUIREMENT],
  },
  {
    id: "hours-refresh",
    label: "Google Places hours refresh",
    scope: "vercel",
    vercelPath: "/api/cron/hours-refresh",
    gate: { env: "HOURS_REFRESH_CRON" },
    requirements: [
      CRON_REQUIREMENT,
      DATABASE_REQUIREMENT,
      { env: "GOOGLE_PLACES_API_KEY" },
    ],
  },
  {
    id: "business-status",
    label: "Google business-status audit",
    scope: "vercel",
    vercelPath: "/api/cron/business-status",
    gate: { env: "BUSINESS_STATUS_CRON" },
    requirements: [CRON_REQUIREMENT, { env: "GOOGLE_PLACES_API_KEY" }],
  },
  {
    id: "radius-search",
    label: "Radius search index refresh",
    scope: "vercel",
    vercelPath: "/api/cron/radius-search",
    gate: { env: "RADIUS_SEARCH_CRON" },
    requirements: [CRON_REQUIREMENT, DATABASE_REQUIREMENT],
  },
  {
    id: "postgis-place-sync",
    label: "PostGIS place mirror sync",
    scope: "vercel",
    vercelPath: "/api/cron/spatial-places",
    gate: { env: "RADIUS_POSTGIS_SYNC" },
    requirements: [CRON_REQUIREMENT, DATABASE_REQUIREMENT],
  },
  {
    id: "data-retention",
    label: "Bounded data retention",
    scope: "vercel",
    vercelPath: "/api/cron/data-health-retention",
    gate: { env: "DATA_RETENTION_PRUNE" },
    requirements: [CRON_REQUIREMENT, DATABASE_REQUIREMENT],
  },
  {
    id: "link-health",
    label: "Outbound link health",
    scope: "vercel",
    vercelPath: "/api/cron/link-health",
    gate: { env: "LINK_HEALTH_CRON" },
    requirements: [CRON_REQUIREMENT],
  },
  {
    id: "saved-reminders",
    label: "Saved-event reminders",
    scope: "vercel",
    vercelPath: "/api/cron/saved-reminders",
    gate: { env: "SAVED_REMINDERS_ENABLED" },
    requirements: [
      CRON_REQUIREMENT,
      DATABASE_REQUIREMENT,
      ...PUSH_REQUIREMENTS,
    ],
  },
  {
    id: "rain-tomorrow",
    label: "Rain-tomorrow notifications",
    scope: "vercel",
    vercelPath: "/api/cron/rain-tomorrow",
    gate: { env: "RAIN_TOMORROW_ENABLED" },
    requirements: [
      CRON_REQUIREMENT,
      DATABASE_REQUIREMENT,
      ...PUSH_REQUIREMENTS,
    ],
  },
  {
    id: "first-saturday",
    label: "First Saturday notifications",
    scope: "vercel",
    vercelPath: "/api/cron/first-saturday",
    gate: { env: "FIRST_SATURDAY_ENABLED" },
    requirements: [
      CRON_REQUIREMENT,
      DATABASE_REQUIREMENT,
      ...PUSH_REQUIREMENTS,
    ],
  },
  {
    id: "bandsintown",
    label: "Bandsintown events",
    scope: "runtime",
    gate: { env: "BANDSINTOWN_ENABLED" },
    requirements: [{ env: "BANDSINTOWN_APP_ID" }],
  },
  {
    id: "seatgeek",
    label: "SeatGeek events",
    scope: "runtime",
    gate: { env: "SEATGEEK_ENABLED" },
    requirements: [{ env: "SEATGEEK_CLIENT_ID" }],
  },
  {
    id: "eventbrite",
    label: "Eventbrite events",
    scope: "runtime",
    gate: { env: "EVENTBRITE_ENABLED" },
    requirements: [{ env: "EVENTBRITE_TOKEN" }],
  },
  {
    id: "open-brewery-db",
    label: "Open Brewery DB discovery",
    scope: "runtime",
    gate: { env: "RADIUS_OBDB" },
  },
  {
    id: "mapillary",
    label: "Mapillary street objects",
    scope: "runtime",
    gate: { env: "MAPILLARY_ENABLED" },
    requirements: [{ env: "MAPILLARY_TOKEN" }],
  },
  {
    id: "pulsepoint",
    label: "PulsePoint incidents",
    scope: "runtime",
    gate: { env: "PULSEPOINT_ENABLED" },
    requirements: [{ env: "PULSEPOINT_AGENCY_ID" }],
  },
  {
    id: "firecrawl-fallback",
    label: "Firecrawl extraction fallback",
    scope: "operator",
    gate: { env: "FIRECRAWL_FETCH_FALLBACK" },
    requirements: [{ env: "FIRECRAWL_API_KEY" }],
  },
  {
    id: "visit-frederick-recovery",
    label: "Visit Frederick snapshot recovery",
    scope: "operator",
    gate: { env: "VISIT_FREDERICK_FACTS_REUSE_APPROVED" },
    requirements: [
      { env: "FIRECRAWL_FETCH_FALLBACK", equals: "1" },
      { env: "FIRECRAWL_API_KEY" },
      { env: "BLOB_READ_WRITE_TOKEN" },
      DATABASE_REQUIREMENT,
    ],
  },
  {
    id: "tavily-source-scout",
    label: "Tavily source scout",
    scope: "operator",
    requirements: [{ env: "TAVILY_API_KEY" }],
    optionalWhenUnconfigured: true,
  },
  {
    id: "firecrawl-source-watch",
    label: "Firecrawl source watch",
    note: "manual only; weekly schedule deferred until county-connector-schedules has an unchanged repeat after baseline run 30734393491 attempt 2",
    scope: "operator",
    requirements: [{ env: "FIRECRAWL_API_KEY" }],
    optionalWhenUnconfigured: true,
  },
  {
    id: "apify-source-change-radar",
    label: "Apify source change radar",
    scope: "operator",
    requirements: [{ env: "APIFY_TOKEN" }],
    optionalWhenUnconfigured: true,
  },
] as const;

function configured(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function requirementMissing(
  requirement: EnvironmentRequirement,
  env: DataToolEnvironment,
): string | null {
  if ("anyOf" in requirement) {
    return requirement.anyOf.some((name) => configured(env[name]))
      ? null
      : `one of ${requirement.anyOf.join(", ")}`;
  }
  if (!configured(env[requirement.env])) return requirement.env;
  if (
    requirement.equals !== undefined &&
    env[requirement.env]?.trim() !== requirement.equals
  ) {
    return `${requirement.env}=${requirement.equals}`;
  }
  return null;
}

export function activationFlagNames(): string[] {
  return [
    ...new Set(
      DATA_TOOL_DEFINITIONS.flatMap((definition) =>
        definition.gate ? [definition.gate.env] : [],
      ),
    ),
  ].sort();
}

export function classifyDataTools(
  env: DataToolEnvironment,
  schedules: ReadonlyMap<string, string>,
): DataToolStatus[] {
  return DATA_TOOL_DEFINITIONS.map((definition) => {
    const missing: string[] = [];
    const schedule = definition.vercelPath
      ? schedules.get(definition.vercelPath)
      : undefined;

    if (definition.vercelPath && !schedule) {
      missing.push(`vercel.json:${definition.vercelPath}`);
    }

    const gateValue = definition.gate?.equals ?? "1";
    const gateEnabled = definition.gate
      ? env[definition.gate.env]?.trim() === gateValue
      : true;

    if (!gateEnabled && missing.length === 0) {
      return {
        id: definition.id,
        label: definition.label,
        note: definition.note,
        scope: definition.scope,
        status: "disabled",
        gate: definition.gate?.env,
        vercelPath: definition.vercelPath,
        schedule,
        missing,
      };
    }

    for (const requirement of definition.requirements ?? []) {
      const absent = requirementMissing(requirement, env);
      if (absent) missing.push(absent);
    }

    const status: DataToolActivationStatus =
      missing.length > 0
        ? definition.optionalWhenUnconfigured && !definition.gate
          ? "disabled"
          : "missing_configuration"
        : "active";

    return {
      id: definition.id,
      label: definition.label,
      note: definition.note,
      scope: definition.scope,
      status,
      gate: definition.gate?.env,
      vercelPath: definition.vercelPath,
      schedule,
      missing,
    };
  });
}

export function renderDataToolStatus(
  statuses: readonly DataToolStatus[],
): string {
  const lines = ["Frederick Radius data-tool activation"];
  for (const item of statuses) {
    const detail =
      item.missing.length > 0
        ? `; missing: ${item.missing.join(", ")}`
        : item.gate && item.status === "disabled"
          ? `; set ${item.gate}=1 to enable`
          : "";
    const schedule = item.schedule ? `; schedule: ${item.schedule}` : "";
    const note = item.note ? `; ${item.note}` : "";
    lines.push(
      `${item.status.toUpperCase().padEnd(21)} ${item.id} [${item.scope}]${schedule}${note}${detail}`,
    );
  }

  const counts = statuses.reduce<Record<DataToolActivationStatus, number>>(
    (total, item) => {
      total[item.status] += 1;
      return total;
    },
    { active: 0, disabled: 0, missing_configuration: 0 },
  );
  lines.push(
    `Summary: ${counts.active} active, ${counts.disabled} disabled, ${counts.missing_configuration} missing configuration.`,
  );
  lines.push(
    "Only environment-variable names are shown; secret values are never printed.",
  );
  return lines.join("\n");
}
