"use strict";

const SOURCE_INTELLIGENCE_SCHEDULES = Object.freeze({
  "11 14 2,16 * *": Object.freeze({
    tool: "tavily-scout",
    profile: "official-civic-mdot",
  }),
  "21 14 5,19 * *": Object.freeze({
    tool: "tavily-scout",
    profile: "official-new-events",
  }),
  "31 14 8,22 * *": Object.freeze({
    tool: "tavily-scout",
    profile: "food-truck-schedules",
  }),
  "41 14 11 * *": Object.freeze({
    tool: "tavily-scout",
    profile: "menus-reservations-accessibility",
  }),
  "51 14 25 * *": Object.freeze({
    tool: "tavily-scout",
    profile: "unresolved-source-recovery",
  }),
});

const MANUAL_TOOLS = new Set([
  "tavily-plan",
  "tavily-scout",
  "firecrawl-watch",
]);

const TAVILY_PROFILES = new Set([
  "provider-smoke",
  "official-civic-mdot",
  "official-new-events",
  "menus-reservations-accessibility",
  "food-truck-schedules",
  "unresolved-source-recovery",
]);

const FIRECRAWL_SOURCES = new Set([
  "downtown-frederick-events",
  "celebrate-frederick-events",
  "great-frederick-fair-schedule",
  "visit-frederick-events",
  "weinberg-performances",
  "sky-stage-calendar",
  "delaplaine-events",
  "maryland-ensemble-events",
  "frederick-center-events",
  "mdcc-deaf-community-events",
  "city-emergency-alerts",
  "county-health-alerts",
  "county-connector-schedules",
  "county-food-truck-roster",
]);

function exactBoolean(value, name) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false" || value === "") return false;
  throw new Error(`${name} must be an exact boolean.`);
}

function scheduledSelection(schedule) {
  if (typeof schedule !== "string" || schedule.length === 0) {
    throw new Error(
      "A scheduled Source Intelligence run is missing its exact cron identity.",
    );
  }
  if (!Object.hasOwn(SOURCE_INTELLIGENCE_SCHEDULES, schedule)) {
    throw new Error(
      `The Source Intelligence cron is not allowlisted: ${schedule}`,
    );
  }
  const configured = SOURCE_INTELLIGENCE_SCHEDULES[schedule];
  return {
    mode: "schedule",
    tool: configured.tool,
    profile: configured.profile ?? "",
    source: configured.source ?? "",
    live: true,
    initializeState: false,
  };
}

function manualSelection(input) {
  const tool = input.tool ?? "";
  if (!MANUAL_TOOLS.has(tool)) {
    throw new Error(`The manual Source Intelligence tool is invalid: ${tool}`);
  }
  const confirmLive = exactBoolean(input.confirmLive ?? false, "confirmLive");
  const initializeState = exactBoolean(
    input.initializeState ?? false,
    "initializeState",
  );
  const isTavily = tool === "tavily-plan" || tool === "tavily-scout";
  const profile = isTavily ? (input.profile ?? "") : "";
  const source = tool === "firecrawl-watch" ? (input.source ?? "") : "";
  if (isTavily && !TAVILY_PROFILES.has(profile)) {
    throw new Error(`The reviewed Tavily profile is invalid: ${profile}`);
  }
  if (tool === "firecrawl-watch" && !FIRECRAWL_SOURCES.has(source)) {
    throw new Error(`The reviewed Firecrawl source is invalid: ${source}`);
  }
  const live = tool !== "tavily-plan" && confirmLive;
  return {
    mode: "manual",
    tool,
    profile,
    source,
    live,
    initializeState: live && initializeState,
  };
}

function resolveSourceIntelligenceSelection(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Source Intelligence selection input is invalid.");
  }
  if (input.eventName === "schedule") {
    return scheduledSelection(input.eventSchedule);
  }
  if (input.eventName === "workflow_dispatch") {
    return manualSelection(input);
  }
  throw new Error(
    `Unsupported Source Intelligence event: ${String(input.eventName ?? "")}`,
  );
}

module.exports = {
  FIRECRAWL_SOURCES,
  MANUAL_TOOLS,
  SOURCE_INTELLIGENCE_SCHEDULES,
  TAVILY_PROFILES,
  resolveSourceIntelligenceSelection,
};
