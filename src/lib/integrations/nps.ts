const NPS_BASE = "https://developer.nps.gov/api/v1";
const NPS_TIMEOUT_MS = 5_000;

// Frederick County NPS units
export const NPS_PARKS = {
  catoctin: "cato",        // Catoctin Mountain Park
  monocacy: "mono",        // Monocacy National Battlefield
  cohi: "choh",            // Chesapeake & Ohio Canal NHP (passes through Brunswick)
} as const;

export type NpsAlert = {
  id: string;
  parkCode: string;
  parkName: string;
  title: string;
  description: string;
  category: "Information" | "Park Closure" | "Caution" | "Danger";
  url: string;
};

export type NpsEvent = {
  id: string;
  parkCode: string;
  title: string;
  description: string;
  dateStart: string;
  dateEnd: string;
  isFree: boolean;
  location: string;
  url: string;
};

async function npsFetch<T>(path: string, params: Record<string, string>, revalidate = 1800): Promise<T | null> {
  const key = process.env.NPS_API_KEY;
  if (!key) return null;
  const url = new URL(`${NPS_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", key);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NPS_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type AlertsResp = {
  data: Array<{
    id: string;
    parkCode: string;
    title: string;
    description: string;
    category: NpsAlert["category"];
    url: string;
  }>;
};

const PARK_NAMES: Record<string, string> = {
  cato: "Catoctin Mountain Park",
  mono: "Monocacy National Battlefield",
  choh: "C&O Canal",
};

export async function getNpsAlerts(): Promise<NpsAlert[]> {
  const parkCodes = Object.values(NPS_PARKS).join(",");
  const data = await npsFetch<AlertsResp>("/alerts", { parkCode: parkCodes, limit: "20" });
  if (!data?.data) return [];
  return data.data.map((a) => ({
    id: a.id,
    parkCode: a.parkCode,
    parkName: PARK_NAMES[a.parkCode] ?? a.parkCode,
    title: a.title,
    description: a.description,
    category: a.category,
    url: a.url,
  }));
}

type EventsResp = {
  data: Array<{
    id: string;
    parkfullname: string;
    title: string;
    description: string;
    datestart: string;
    dateend: string;
    isfree: string;
    location: string;
    infourl: string;
    sitecode?: string;
  }>;
};

export async function getNpsEvents(): Promise<NpsEvent[]> {
  const parkCodes = Object.values(NPS_PARKS).join(",");
  const data = await npsFetch<EventsResp>("/events", { parkCode: parkCodes, pageSize: "20" });
  if (!data?.data) return [];
  return data.data.map((e) => ({
    id: e.id,
    parkCode: e.sitecode ?? "",
    title: e.title,
    description: e.description,
    dateStart: e.datestart,
    dateEnd: e.dateend,
    isFree: e.isfree === "true" || e.isfree === "1",
    location: e.location,
    url: e.infourl,
  }));
}
