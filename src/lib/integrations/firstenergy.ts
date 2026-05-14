/**
 * FirstEnergy — Potomac Edison / MD-WV power outages.
 * Free, no key required. JSON feed updates ~every 15 minutes.
 *
 * Source: https://outages-mdwv.firstenergycorp.com/
 * Customer-impact data by county/municipality.
 *
 * The exact JSON path varies by FirstEnergy report version; we hit the
 * "Customers Out by County/Muni" report endpoint and fall back to a
 * county-level summary.
 */

const ENDPOINT = "https://outages-mdwv.firstenergycorp.com/data/interval_generation_data/2/report.js";

export type OutageRow = {
  area: string;
  customers_out: number;
  customers_served: number;
  percentage: number;
  scope: "county" | "muni" | "state";
};

type RawEntry = {
  area_name?: string;
  cust_a?: { val?: number };
  cust_s?: { val?: number };
  percent_cust_a?: { val?: number };
  areas?: RawEntry[];
};

const FREDERICK_MUNIS = new Set([
  "frederick", "brunswick", "thurmont", "middletown", "walkersville",
  "emmitsburg", "new market", "mount airy", "myersville", "woodsboro",
  "burkittsville", "rosemont",
]);

function flatten(entries: RawEntry[] | undefined, scope: OutageRow["scope"], out: OutageRow[]) {
  if (!entries) return;
  for (const e of entries) {
    const name = String(e.area_name ?? "").trim();
    if (!name) continue;
    out.push({
      area: name,
      customers_out: Number(e.cust_a?.val ?? 0),
      customers_served: Number(e.cust_s?.val ?? 0),
      percentage: Number(e.percent_cust_a?.val ?? 0),
      scope,
    });
    if (e.areas) flatten(e.areas, scope === "state" ? "county" : "muni", out);
  }
}

export async function getFrederickOutages(): Promise<{
  total_out: number;
  total_served: number;
  county?: OutageRow;
  munis: OutageRow[];
}> {
  try {
    const res = await fetch(ENDPOINT, {
      headers: { Accept: "application/json, application/javascript, */*" },
      next: { revalidate: 600 },
    });
    if (!res.ok) return { total_out: 0, total_served: 0, munis: [] };
    let text = await res.text();
    // FirstEnergy wraps JSON in a JS variable assignment like `var dataset_1 = {...};`
    const jsonMatch = text.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (jsonMatch) text = jsonMatch[1];
    const data = JSON.parse(text) as RawEntry;
    const rows: OutageRow[] = [];
    flatten(data.areas, "county", rows);

    const county = rows.find(
      (r) => r.scope === "county" && /^frederick$/i.test(r.area),
    );
    const munis = rows.filter(
      (r) => r.scope === "muni" && FREDERICK_MUNIS.has(r.area.toLowerCase().trim()),
    );

    return {
      total_out: county?.customers_out ?? munis.reduce((s, m) => s + m.customers_out, 0),
      total_served: county?.customers_served ?? munis.reduce((s, m) => s + m.customers_served, 0),
      county,
      munis: munis.sort((a, b) => b.customers_out - a.customers_out),
    };
  } catch {
    return { total_out: 0, total_served: 0, munis: [] };
  }
}
