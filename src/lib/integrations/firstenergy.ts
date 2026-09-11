/**
 * FirstEnergy — Potomac Edison / MD-WV power outages.
 * Free, no key required. KUBRA's public report updates throughout the day.
 *
 * Source: https://outages-mdwv.firstenergycorp.com/
 * Customer-impact data by county and municipality.
 */

const KUBRA = "https://kubra.io";
const STORMCENTER_ID = "6c715f0e-bbec-465f-98cc-0b81623744be";
const VIEW_ID = "5ed3ddf1-3a6f-4cfd-8957-eba54b5baaad";
const API_ROOT = `${KUBRA}/stormcenter/api/v1/stormcenters/${STORMCENTER_ID}/views/${VIEW_ID}`;
const CURRENT_STATE_URL = `${API_ROOT}/currentState?preview=false`;
const FIRSTENERGY_FETCH_TIMEOUT_MS = 6_000;
export const FIRSTENERGY_OUTAGE_MAP_URL = "https://outages-mdwv.firstenergycorp.com/";

export type OutageRow = {
  area: string;
  customers_out: number;
  customers_served: number;
  percentage: number;
  scope: "county" | "muni" | "state";
};

export type FrederickOutages = {
  total_out: number;
  total_served: number;
  county?: OutageRow;
  munis: OutageRow[];
};

export type FrederickOutagesResult = {
  data: FrederickOutages;
  /** A successful, parseable report that contains Frederick County. */
  available: boolean;
  /** KUBRA's own report-state timestamp, not the time Radius rendered. */
  asOf?: string;
};

type CurrentState = {
  updatedAt?: number | string;
  stormcenterDeploymentId?: string;
  data?: { interval_generation_data?: string };
};

type ReportDefinition = {
  areaType?: string;
  source?: string;
};

type Configuration = {
  config?: {
    reports?: {
      data?: {
        interval_generation_data?: ReportDefinition[];
      };
    };
  };
};

type RawValue = number | string | { val?: number | string } | null;

type RawEntry = {
  key?: string;
  name?: string;
  area_name?: string;
  cust_a?: RawValue;
  cust_s?: RawValue;
  percent_cust_a?: RawValue;
  areas?: RawEntry[];
};

type ReportPayload = {
  file_data?: { areas?: RawEntry[] };
};

const EMPTY: FrederickOutages = { total_out: 0, total_served: 0, munis: [] };

function numeric(value: RawValue | undefined): number {
  const raw = value && typeof value === "object" ? value.val : value;
  const number = Number(raw ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function outageRow(entry: RawEntry, scope: OutageRow["scope"]): OutageRow | null {
  const area = String(entry.name ?? entry.area_name ?? "").trim();
  if (!area) return null;
  return {
    area,
    customers_out: numeric(entry.cust_a),
    customers_served: numeric(entry.cust_s),
    percentage: numeric(entry.percent_cust_a),
    scope,
  };
}

function asOfIso(value: CurrentState["updatedAt"]): string | undefined {
  if (value == null) return undefined;
  const numericValue = typeof value === "number" ? value : Number(value);
  const date = Number.isFinite(numericValue)
    ? new Date(numericValue < 1_000_000_000_000 ? numericValue * 1_000 : numericValue)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * KUBRA rotates the data directory and deployment identifier. Resolve both
 * from currentState, then discover the Maryland municipality report from that
 * deployment's public configuration instead of pinning a stale report URL.
 */
export async function getFrederickOutagesResult(): Promise<FrederickOutagesResult> {
  // One deadline covers all three dependent KUBRA reads. If the first call
  // consumes the budget, the configuration/report calls fail immediately
  // instead of turning one optional status tile into a long request chain.
  const signal = AbortSignal.timeout(FIRSTENERGY_FETCH_TIMEOUT_MS);
  try {
    const stateResponse = await fetch(CURRENT_STATE_URL, {
      headers: { Accept: "application/json" },
      signal,
      next: { revalidate: 300 },
    });
    if (!stateResponse.ok) return { data: EMPTY, available: false };

    const state = (await stateResponse.json()) as CurrentState;
    const deploymentId = state.stormcenterDeploymentId;
    const dataPath = state.data?.interval_generation_data;
    if (!deploymentId || !/^[a-z0-9-]+$/i.test(deploymentId)) {
      return { data: EMPTY, available: false, asOf: asOfIso(state.updatedAt) };
    }
    if (!dataPath || !/^data\/[a-z0-9-]+$/i.test(dataPath)) {
      return { data: EMPTY, available: false, asOf: asOfIso(state.updatedAt) };
    }

    const configResponse = await fetch(
      `${API_ROOT}/configuration/${deploymentId}?preview=false`,
      {
        headers: { Accept: "application/json" },
        signal,
        next: { revalidate: 86_400 },
      },
    );
    if (!configResponse.ok) {
      return { data: EMPTY, available: false, asOf: asOfIso(state.updatedAt) };
    }
    const config = (await configResponse.json()) as Configuration;
    const source = config.config?.reports?.data?.interval_generation_data
      ?.find((report) => report.areaType === "mdmuni")
      ?.source;
    if (!source || !/^public\/reports\/[a-z0-9-]+_report\.json$/i.test(source)) {
      return { data: EMPTY, available: false, asOf: asOfIso(state.updatedAt) };
    }

    const reportResponse = await fetch(`${KUBRA}/${dataPath}/${source}`, {
      headers: { Accept: "application/json" },
      signal,
      next: { revalidate: 300 },
    });
    if (!reportResponse.ok) {
      return { data: EMPTY, available: false, asOf: asOfIso(state.updatedAt) };
    }

    const report = (await reportResponse.json()) as ReportPayload;
    const counties = report.file_data?.areas;
    if (!Array.isArray(counties)) {
      return { data: EMPTY, available: false, asOf: asOfIso(state.updatedAt) };
    }
    const countyEntry = counties.find(
      (entry) => entry.key?.toLowerCase() === "county" && entry.name?.trim().toLowerCase() === "frederick",
    );
    const county = countyEntry ? outageRow(countyEntry, "county") : null;
    if (!county || !countyEntry) {
      return { data: EMPTY, available: false, asOf: asOfIso(state.updatedAt) };
    }

    const munis = (countyEntry.areas ?? [])
      .filter((entry) => !entry.key || entry.key.toLowerCase() === "mdmuni")
      .map((entry) => outageRow(entry, "muni"))
      .filter((row): row is OutageRow => row !== null)
      .sort((a, b) => b.customers_out - a.customers_out || a.area.localeCompare(b.area));

    return {
      data: {
        total_out: county.customers_out,
        total_served: county.customers_served,
        county,
        munis,
      },
      available: true,
      asOf: asOfIso(state.updatedAt),
    };
  } catch {
    return { data: EMPTY, available: false };
  }
}

/** Compatibility wrapper for existing detail surfaces. */
export async function getFrederickOutages(): Promise<FrederickOutages> {
  return (await getFrederickOutagesResult()).data;
}
