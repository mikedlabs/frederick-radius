/**
 * FAA airport status for the three airports Frederick County actually flies
 * out of: BWI, Dulles (IAD), Reagan National (DCA).
 *
 * Source: the FAA National Airspace System status feed —
 *   https://nasstatus.faa.gov/api/airport-status-information
 * Free, no key. It's a NATIONAL XML feed of every airport with an active
 * ground delay / ground stop / closure / arrival-departure delay; an airport
 * NOT listed has no delays. So we fetch the feed and filter to our three —
 * absence = "on time," which is honest by construction.
 *
 * (The old per-airport ASWS endpoint soa.smext.faa.gov was retired; this NAS
 * feed is the current public source.)
 */

const ENDPOINT = "https://nasstatus.faa.gov/api/airport-status-information";

export type AirportState = "clear" | "delay" | "ground_stop" | "closure";

export type AirportStatus = {
  code: "BWI" | "IAD" | "DCA";
  name: string;
  state: AirportState;
  /** One short human line when there IS something ("46m–1h, thunderstorms"). */
  detail?: string;
};

const TARGETS: ReadonlyArray<{ code: AirportStatus["code"]; name: string }> = [
  { code: "BWI", name: "BWI Marshall" },
  { code: "IAD", name: "Dulles" },
  { code: "DCA", name: "Reagan National" },
];

const SEVERITY: Record<AirportState, number> = { clear: 0, delay: 1, ground_stop: 2, closure: 3 };

function classifySection(name: string): AirportState {
  const s = name.toLowerCase();
  if (s.includes("closure")) return "closure";
  if (s.includes("ground stop")) return "ground_stop";
  return "delay"; // "Ground Delay Programs" + "General Arrival/Departure Delay Info"
}

function pick(re: RegExp, hay: string): string | undefined {
  const m = hay.match(re);
  return m ? m[1].trim() : undefined;
}

/**
 * The three area airports' current status, most-severe-wins per airport.
 * On any fetch/parse failure returns [] — we never fabricate "on time" when
 * we couldn't actually read the feed.
 */
export async function getAreaAirportStatus(): Promise<AirportStatus[]> {
  let xml = "";
  try {
    const res = await fetch(ENDPOINT, {
      next: { revalidate: 120 },
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/xml" },
    });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }
  if (!xml.includes("AIRPORT_STATUS_INFORMATION")) return [];

  // Split into the feed's delay-type sections; each carries a <Name> and a list
  // of airport items. We scan every section for our three codes and keep the
  // most severe hit per airport (a closure outranks a ground stop outranks a
  // plain delay).
  const sections = xml.split("<Delay_type>");

  return TARGETS.map(({ code, name }) => {
    const status: AirportStatus = { code, name, state: "clear" };
    let bestSeverity = 0;
    const tag = `<ARPT>${code}</ARPT>`;
    for (const section of sections) {
      const at = section.indexOf(tag);
      if (at === -1) continue;
      const state = classifySection(pick(/<Name>([\s\S]*?)<\/Name>/, section) ?? "");
      if (SEVERITY[state] <= bestSeverity) continue;
      bestSeverity = SEVERITY[state];
      status.state = state;
      // The item's detail fields sit right after its <ARPT>; clamp the window
      // so we read THIS airport's numbers, not the next listing's.
      const seg = section.slice(at, at + 500);
      const reason = pick(/<Reason>([\s\S]*?)<\/Reason>/, seg)?.replace(/^WX:\s*/i, "");
      const avg = pick(/<Avg>([\s\S]*?)<\/Avg>/, seg);
      const min = pick(/<Min>([\s\S]*?)<\/Min>/, seg);
      const max = pick(/<Max>([\s\S]*?)<\/Max>/, seg);
      const dur = avg ? `${avg} avg` : min && max ? `${min}–${max}` : max ?? min;
      status.detail = [dur, reason].filter(Boolean).join(" · ") || undefined;
    }
    return status;
  });
}
