import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import {
  getOfficialCivicAlertsResult,
  type OfficialCivicAlertsResult,
} from "@/lib/integrations/official-alert-feeds";
import {
  getNwsLocalStormReportsResult,
  type NwsLocalStormReportsResult,
} from "@/lib/integrations/nws-local-storm-reports";
import {
  getNowCoastLightningResult,
  type NowCoastLightningResult,
} from "@/lib/integrations/nowcoast-lightning";

export type OfficialSignalsSnapshot = {
  generatedAt: string;
  civic: OfficialCivicAlertsResult;
  stormReports: NwsLocalStormReportsResult;
  lightning: NowCoastLightningResult;
  summary: {
    activeCivicAlerts: number;
    recentStormReports: number;
    coverage: "complete" | "partial";
    unavailable: string[];
  };
};

async function loadOfficialCivicAlerts(): Promise<OfficialCivicAlertsResult> {
  return getOfficialCivicAlertsResult({
    deadlineMs: 2_800,
    revalidateSeconds: 300,
  });
}

async function loadStormReports(): Promise<NwsLocalStormReportsResult> {
  return getNwsLocalStormReportsResult({
    deadlineMs: 3_200,
    revalidateSeconds: 600,
    maxProducts: 12,
  });
}

async function loadLightning(): Promise<NowCoastLightningResult> {
  return getNowCoastLightningResult({
    deadlineMs: 2_800,
    revalidateSeconds: 900,
  });
}

const getCachedOfficialCivicAlerts = unstable_cache(
  loadOfficialCivicAlerts,
  ["official-civic-alerts-v1", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  { revalidate: 300, tags: ["official-civic-alerts"] },
);

const getCachedStormReports = unstable_cache(
  loadStormReports,
  ["official-storm-reports-v1", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  { revalidate: 600, tags: ["official-storm-reports"] },
);

const getCachedLightning = unstable_cache(
  loadLightning,
  ["official-lightning-v1", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  { revalidate: 900, tags: ["official-lightning"] },
);

const getOfficialCivicAlertsForRequest = cache(getCachedOfficialCivicAlerts);
const getStormReportsForRequest = cache(getCachedStormReports);
const getLightningForRequest = cache(getCachedLightning);

export function getOfficialCivicAlertsSnapshot(): Promise<OfficialCivicAlertsResult> {
  return getOfficialCivicAlertsForRequest();
}

export function getOfficialStormReportsSnapshot(): Promise<NwsLocalStormReportsResult> {
  return getStormReportsForRequest();
}

export function getOfficialLightningSnapshot(): Promise<NowCoastLightningResult> {
  return getLightningForRequest();
}

async function loadOfficialSignals(): Promise<OfficialSignalsSnapshot> {
  const [civic, stormReports, lightning] = await Promise.all([
    getOfficialCivicAlertsSnapshot(),
    getOfficialStormReportsSnapshot(),
    getOfficialLightningSnapshot(),
  ]);
  const generatedAt = new Date().toISOString();
  const unavailable = [
    ...(!civic.available ? ["City and County alert feeds"] : []),
    ...(!stormReports.available ? ["NWS local storm reports"] : []),
    ...(!lightning.available || lightning.stale
      ? ["NOAA lightning density"]
      : []),
  ];

  return {
    generatedAt,
    civic,
    stormReports,
    lightning,
    summary: {
      activeCivicAlerts: civic.alerts.length,
      recentStormReports: stormReports.reports.filter(
        (report) => report.state === "recent",
      ).length,
      coverage: unavailable.length === 0 && !civic.degraded && !stormReports.degraded
        ? "complete"
        : "partial",
      unavailable,
    },
  };
}

const getOfficialSignalsForRequest = cache(loadOfficialSignals);

export function getOfficialSignalsSnapshot(): Promise<OfficialSignalsSnapshot> {
  return getOfficialSignalsForRequest();
}
